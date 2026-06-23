import * as cheerio from 'cheerio';

import type { IMarketplaceExtractor, RawListing, RawSeller } from '../IMarketplaceExtractor.js';

/**
 * Yad2 (yad2.co.il) listing extractor.
 *
 * Fetches a Yad2 item page over HTTP, parses the static HTML with cheerio,
 * and returns a normalized {@link RawListing}.
 *
 * Notes:
 * - Yad2 pages are partially hydrated client-side. This extractor reads the
 *   server-rendered HTML only; if a required field comes back missing for a
 *   live URL, we log a JS-rendered-content warning and return partial data
 *   instead of throwing (per Phase 2 brief).
 * - One retry (10s timeout) on network failure or non-2xx, then we throw.
 */

const YAD2_HOST_REGEX = /^(?:www\.)?yad2\.co\.il$/i;
const YAD2_ITEM_PATH_PREFIX = '/item/';
const FETCH_TIMEOUT_INITIAL_MS = 5_000;
const FETCH_TIMEOUT_RETRY_MS = 10_000;

/** Extract the first numeric run from a string. Returns 0 if none. */
function parsePriceText(text: string | undefined): number {
  if (!text) return 0;
  const match = text.replace(/[\s,]/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const n = Number.parseFloat(match[1]);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Pick the first non-empty trimmed text from a list of cheerio selectors. */
function firstText(
  $: cheerio.CheerioAPI,
  selectors: string[],
): string | undefined {
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length === 0) continue;
    const txt = el.text().trim();
    if (txt) return txt;
  }
  return undefined;
}

export class Yad2Extractor implements IMarketplaceExtractor {
  validateUrl(url: string): boolean {
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

  /**
   * Fetch the listing page HTML. Throws on network/HTTP failure — caller is
   * responsible for retry policy.
   */
  async fetchPage(url: string, timeoutMs: number = FETCH_TIMEOUT_INITIAL_MS): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          // Yad2 returns a stripped page to obvious bots; mimic a browser UA.
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        },
      });
      if (!response.ok) {
        throw new Error(`Yad2 fetch failed: HTTP ${response.status}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parse a date string. Supports ISO-8601 (from `time[datetime]`) and the
   * `DD/MM/YYYY` Israeli format found in posted-date spans.
   */
  parseDate(dateStr: string | undefined | null): Date | undefined {
    if (!dateStr) return undefined;
    const trimmed = dateStr.trim();
    if (!trimmed) return undefined;

    // ISO-ish (has T or starts with YYYY-)
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const d = new Date(trimmed);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }

    // DD/MM/YYYY or DD.MM.YYYY
    const m = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
    if (m) {
      const day = Number.parseInt(m[1], 10);
      const month = Number.parseInt(m[2], 10) - 1;
      let year = Number.parseInt(m[3], 10);
      if (year < 100) year += 2000;
      const d = new Date(year, month, day);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }

    // Last-ditch attempt — let Date try.
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  async extractListing(url: string): Promise<RawListing> {
    if (!this.validateUrl(url)) {
      throw new Error(`Yad2Extractor: invalid Yad2 URL: ${url}`);
    }

    const html = await this.fetchWithRetry(url);
    return this.parseHtml(html, url);
  }

  /** Fetch with a single retry. Throws if both attempts fail. */
  private async fetchWithRetry(url: string): Promise<string> {
    try {
      return await this.fetchPage(url, FETCH_TIMEOUT_INITIAL_MS);
    } catch (firstErr) {
      console.warn(
        '[yad2] first fetch failed, retrying:',
        firstErr instanceof Error ? firstErr.message : firstErr,
      );
      try {
        return await this.fetchPage(url, FETCH_TIMEOUT_RETRY_MS);
      } catch (secondErr) {
        throw new Error(
          `Yad2Extractor: fetch failed twice for ${url}: ${
            secondErr instanceof Error ? secondErr.message : String(secondErr)
          }`,
        );
      }
    }
  }

  /** Parse the listing HTML. Pure (no I/O) for easy testing of new pages. */
  private parseHtml(html: string, url: string): RawListing {
    const $ = cheerio.load(html);

    const title =
      this.safeExtract('title', () =>
        firstText($, ['h1.item-title', '[data-testid="item-title"]']) ?? '',
      ) ?? '';

    const priceText = this.safeExtract('price', () =>
      firstText($, ['span.price-value', '[data-testid="price"]']),
    );
    const price = parsePriceText(priceText);

    const description = this.safeExtract('description', () =>
      firstText($, ['div.item-description', 'p.item-text']),
    );

    const seller = this.safeExtract<RawSeller | undefined>('seller', () => {
      const el = $('a.seller-name').first().length
        ? $('a.seller-name').first()
        : $('[data-testid="seller-profile"]').first();
      if (el.length === 0) return undefined;
      const name = el.text().trim();
      if (!name) return undefined;
      const href = el.attr('href');
      return {
        name,
        profileUrl: href ? this.resolveUrl(href, url) : undefined,
      };
    });

    const images = this.safeExtract<string[]>('images', () => {
      const out: string[] = [];
      $('img.item-image').each((_, el) => {
        const src = $(el).attr('src');
        if (src) out.push(src);
      });
      return out;
    }) ?? [];

    const postedDate = this.safeExtract<Date | undefined>('postedDate', () => {
      const timeEl = $('time[datetime]').first();
      if (timeEl.length > 0) {
        const attr = timeEl.attr('datetime');
        const parsed = this.parseDate(attr);
        if (parsed) return parsed;
      }
      const span = $('span.posted-date').first();
      if (span.length > 0) {
        return this.parseDate(span.text());
      }
      return undefined;
    });

    // If the static page yielded nothing useful, the listing was likely
    // hydrated client-side — surface a warning so the caller can fall back
    // to the extension DOM extractor.
    if (!title && price === 0 && images.length === 0) {
      console.warn(
        '[yad2] static HTML looked empty — page may be JS-rendered:',
        url,
      );
    }

    return {
      title,
      price,
      currency: 'ILS',
      description,
      seller,
      images,
      postedDate,
      url,
      marketplace: 'yad2',
    };
  }

  /**
   * Run an extractor for a single field; on unexpected parse errors log a
   * warning and skip the field instead of failing the whole extraction.
   */
  private safeExtract<T>(field: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (err) {
      console.warn(
        `[yad2] failed to extract ${field}:`,
        err instanceof Error ? err.message : err,
      );
      return undefined;
    }
  }

  /** Resolve a possibly-relative URL against the listing page URL. */
  private resolveUrl(href: string, base: string): string {
    try {
      return new URL(href, base).toString();
    } catch {
      return href;
    }
  }
}
