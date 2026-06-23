import type { IMarketplaceExtractor, RawListing, RawSeller } from '../../IMarketplaceExtractor.js';
import type { TavilyResponse } from './types.js';
import { extractPrices } from './priceExtractor.js';
import { tavilySearch } from './tavilyClient.js';
import { parseDate, median, pickTitle, pickDescription, findDate, extractSellerName } from './parsers.js';

const YAD2_HOST_REGEX = /^(?:www\.|m\.)?yad2\.co\.il$/i;
const YAD2_ITEM_PATH_PREFIX = '/item/';

export class Yad2Extractor implements IMarketplaceExtractor {
  static validateUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (!YAD2_HOST_REGEX.test(parsed.hostname)) return false;
    return parsed.pathname.startsWith(YAD2_ITEM_PATH_PREFIX);
  }

  validateUrl(url: string): boolean {
    return Yad2Extractor.validateUrl(url);
  }

  extractProductId(url: string): string | undefined {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const tail = segments[0]?.toLowerCase() === 'item' ? segments.slice(1) : segments;
      const last = tail[tail.length - 1];
      if (!last) return undefined;
      const cleaned = last.replace(/\.[a-z0-9]+$/i, '').trim();
      return cleaned || undefined;
    } catch {
      return undefined;
    }
  }

  parseDate(dateStr: string | undefined | null): Date | undefined {
    return parseDate(dateStr);
  }

  async tavilySearch(query: string): Promise<TavilyResponse | undefined> {
    return tavilySearch(query);
  }

  async extractListing(url: string): Promise<RawListing> {
    if (!this.validateUrl(url)) {
      throw new Error(`Yad2Extractor: invalid Yad2 URL: ${url}`);
    }

    const productId = this.extractProductId(url);

    if (!productId) {
      console.warn('[yad2] could not extract product id from URL:', url);
      return this.buildEmptyListing(url, '');
    }

    const queries = [`Yad2 ${productId}`, `יד2 ${productId} מחיר`];
    const responses: TavilyResponse[] = [];
    for (const q of queries) {
      const r = await tavilySearch(q);
      if (r) responses.push(r);
    }

    if (responses.length === 0) {
      console.warn('[yad2] no Tavily results for', url, '— returning partial listing');
      return this.buildEmptyListing(url, productId);
    }

    return this.parseTavilyResults(responses, url, productId);
  }

  parseTavilyResults(responses: TavilyResponse[], url: string, productId: string): RawListing {
    const snippets: string[] = [];
    const titles: string[] = [];
    let seller: RawSeller | undefined;

    for (const resp of responses) {
      if (resp.answer) snippets.push(resp.answer);
      for (const r of resp.results ?? []) {
        if (r.title) titles.push(r.title);
        if (r.content) snippets.push(r.content);
        if (r.snippet) snippets.push(r.snippet);
        if (!seller && r.url) {
          const sellerName = extractSellerName([r.title, r.content, r.snippet]);
          if (sellerName) seller = { name: sellerName, profileUrl: r.url };
        }
      }
    }

    const title = pickTitle(titles) ?? productId;
    const prices = snippets.flatMap((s) => extractPrices(s));
    const price = prices.length > 0 ? median(prices) : 0;
    const description = pickDescription(snippets);
    const postedDate = findDate(snippets);

    return { title, price, currency: 'ILS', description, seller, images: [], postedDate, url, marketplace: 'yad2' };
  }

  private buildEmptyListing(url: string, fallbackTitle: string): RawListing {
    return { title: fallbackTitle, price: 0, currency: 'ILS', description: undefined, seller: undefined, images: [], postedDate: undefined, url, marketplace: 'yad2' };
  }
}
