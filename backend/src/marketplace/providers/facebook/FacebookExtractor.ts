import * as cheerio from 'cheerio';
import type { IMarketplaceExtractor, RawListing, RawSeller } from '../../IMarketplaceExtractor.js';
import { parsePriceText, parseCurrency, firstText, firstAttr } from './htmlParser.js';

const FACEBOOK_HOST_REGEX = /^(?:[\w-]+\.)*facebook\.com$/i;
const FACEBOOK_MARKETPLACE_PATH_PREFIX = '/marketplace/item/';
const FETCH_TIMEOUT_INITIAL_MS = 5_000;
const FETCH_TIMEOUT_RETRY_MS = 10_000;

export class FacebookExtractor implements IMarketplaceExtractor {
  static validateUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (!FACEBOOK_HOST_REGEX.test(parsed.hostname)) return false;
    return parsed.pathname.startsWith(FACEBOOK_MARKETPLACE_PATH_PREFIX);
  }

  validateUrl(url: string): boolean {
    return FacebookExtractor.validateUrl(url);
  }

  async fetchPage(url: string, timeoutMs: number = FETCH_TIMEOUT_INITIAL_MS): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!response.ok) throw new Error(`Facebook fetch failed: HTTP ${response.status}`);
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  parseDate(dateStr: string | undefined | null): Date | undefined {
    if (!dateStr) return undefined;
    const trimmed = dateStr.trim();
    if (!trimmed) return undefined;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const d = new Date(trimmed);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  async extractListing(url: string): Promise<RawListing> {
    if (!this.validateUrl(url)) {
      throw new Error(`FacebookExtractor: invalid Facebook Marketplace URL: ${url}`);
    }
    const html = await this.fetchWithRetry(url);
    return this.parseHtml(html, url);
  }

  private async fetchWithRetry(url: string): Promise<string> {
    try {
      return await this.fetchPage(url, FETCH_TIMEOUT_INITIAL_MS);
    } catch (firstErr) {
      console.warn('[facebook] first fetch failed, retrying:', firstErr instanceof Error ? firstErr.message : firstErr);
      try {
        return await this.fetchPage(url, FETCH_TIMEOUT_RETRY_MS);
      } catch (secondErr) {
        throw new Error(`FacebookExtractor: fetch failed twice for ${url}: ${secondErr instanceof Error ? secondErr.message : String(secondErr)}`);
      }
    }
  }

  private parseHtml(html: string, url: string): RawListing {
    const $ = cheerio.load(html);

    const title = this.safeExtract('title', () =>
      firstAttr($, [
        ['meta[property="og:title"]', 'content'],
        ['meta[name="twitter:title"]', 'content'],
      ]) ?? firstText($, ['h1']) ?? '',
    ) ?? '';

    const priceText = this.safeExtract('price', () =>
      firstAttr($, [
        ['meta[property="product:price:amount"]', 'content'],
        ['meta[property="og:price:amount"]', 'content'],
      ]) ?? firstText($, ['[data-testid="marketplace-pdp-price"]', 'span[aria-label*="price" i]']),
    );
    const price = parsePriceText(priceText);

    const currency = this.safeExtract('currency', () =>
      firstAttr($, [
        ['meta[property="product:price:currency"]', 'content'],
        ['meta[property="og:price:currency"]', 'content'],
      ]),
    ) ?? parseCurrency(priceText);

    const description = this.safeExtract('description', () =>
      firstAttr($, [
        ['meta[property="og:description"]', 'content'],
        ['meta[name="description"]', 'content'],
      ]) ?? firstText($, ['[data-testid="marketplace-pdp-description"]']),
    );

    const seller = this.safeExtract<RawSeller | undefined>('seller', () => {
      const link = $('a[href*="/marketplace/profile/"]').first();
      if (link.length === 0) return undefined;
      const name = link.text().trim();
      if (!name) return undefined;
      const href = link.attr('href');
      return { name, profileUrl: href ? this.resolveUrl(href, url) : undefined };
    });

    const images = this.safeExtract<string[]>('images', () => {
      const out: string[] = [];
      const seen = new Set<string>();
      $('meta[property="og:image"]').each((_, el) => {
        const src = $(el).attr('content');
        if (src && !seen.has(src)) { out.push(src); seen.add(src); }
      });
      $('img[src*="scontent"], [data-testid="marketplace-pdp-image"] img').each((_, el) => {
        const src = $(el).attr('src');
        if (src && !seen.has(src)) { out.push(src); seen.add(src); }
      });
      return out;
    }) ?? [];

    const postedDate = this.safeExtract<Date | undefined>('postedDate', () => {
      const isoAttr = firstAttr($, [
        ['meta[property="article:published_time"]', 'content'],
        ['meta[property="og:updated_time"]', 'content'],
        ['time[datetime]', 'datetime'],
      ]);
      return this.parseDate(isoAttr);
    });

    if (!title && price === 0 && images.length === 0) {
      console.warn('[facebook] static HTML looked empty — page may be JS-rendered or bot-blocked:', url);
    }

    return { title, price, currency, description, seller, images, postedDate, url, marketplace: 'facebook' };
  }

  private safeExtract<T>(field: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (err) {
      console.warn(`[facebook] failed to extract ${field}:`, err instanceof Error ? err.message : err);
      return undefined;
    }
  }

  private resolveUrl(href: string, base: string): string {
    try {
      return new URL(href, base).toString();
    } catch {
      return href;
    }
  }
}
