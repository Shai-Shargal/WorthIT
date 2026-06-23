import * as cheerio from 'cheerio';

import type { IMarketplaceExtractor, RawListing, RawSeller } from '../IMarketplaceExtractor.js';

/**
 * Facebook Marketplace listing extractor.
 *
 * Fetches a Facebook Marketplace item page over HTTP, parses the static HTML
 * with cheerio, and returns a normalized {@link RawListing}.
 *
 * Notes:
 * - Facebook Marketplace is heavily JS-rendered and bot-blocked. This
 *   extractor reads server-rendered HTML (Open Graph meta + a few public
 *   selectors) only. For a logged-in scrape with full DOM access, the Chrome
 *   extension content-script remains the canonical Phase 1 path; this
 *   extractor exists for backend-driven URL ingestion (Phase 2 alignment
 *   with {@link Yad2Extractor}).
 * - When the static HTML yields nothing useful we log a warning and return
 *   a partial RawListing instead of throwing, so the caller can fall back.
 * - One retry (10s timeout) on network failure or non-2xx, then we throw.
 */

const FACEBOOK_HOST_REGEX = /^(?:[\w-]+\.)*facebook\.com$/i;
const FACEBOOK_MARKETPLACE_PATH_PREFIX = '/marketplace/item/';
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

/**
 * Best-effort currency detection from a price string. Facebook localizes
 * prices to the viewing region, so we look for common symbols/codes and
 * default to USD when nothing is recognizable.
 */
function parseCurrency(text: string | undefined): string {
  if (!text) return 'USD';
  if (/\bILS\b|₪|שח/i.test(text)) return 'ILS';
  if (/\bEUR\b|€/.test(text)) return 'EUR';
  if (/\bGBP\b|£/.test(text)) return 'GBP';
  if (/\bUSD\b|\$/.test(text)) return 'USD';
  return 'USD';
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

/** Pick the first non-empty attribute value across a list of selectors. */
function firstAttr(
  $: cheerio.CheerioAPI,
  selectors: Array<[selector: string, attr: string]>,
): string | undefined {
  for (const [sel, attr] of selectors) {
    const el = $(sel).first();
    if (el.length === 0) continue;
    const v = el.attr(attr);
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export class FacebookExtractor implements IMarketplaceExtractor {
  /**
   * Static form of {@link FacebookExtractor.validateUrl} so the
   * {@link MarketplaceExtractorFactory} can route a URL without
   * instantiating every extractor. The instance method delegates here so
   * both forms stay in sync.
   */
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
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!response.ok) {
        throw new Error(`Facebook fetch failed: HTTP ${response.status}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parse a date string. Supports ISO-8601 (the standard format used in
   * Open Graph `article:published_time` meta tags) and falls back to
   * `Date` constructor parsing for anything else.
   */
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

  /** Fetch with a single retry. Throws if both attempts fail. */
  private async fetchWithRetry(url: string): Promise<string> {
    try {
      return await this.fetchPage(url, FETCH_TIMEOUT_INITIAL_MS);
    } catch (firstErr) {
      console.warn(
        '[facebook] first fetch failed, retrying:',
        firstErr instanceof Error ? firstErr.message : firstErr,
      );
      try {
        return await this.fetchPage(url, FETCH_TIMEOUT_RETRY_MS);
      } catch (secondErr) {
        throw new Error(
          `FacebookExtractor: fetch failed twice for ${url}: ${
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
      return {
        name,
        profileUrl: href ? this.resolveUrl(href, url) : undefined,
      };
    });

    const images = this.safeExtract<string[]>('images', () => {
      const out: string[] = [];
      const seen = new Set<string>();
      $('meta[property="og:image"]').each((_, el) => {
        const src = $(el).attr('content');
        if (src && !seen.has(src)) {
          out.push(src);
          seen.add(src);
        }
      });
      $('img[src*="scontent"], [data-testid="marketplace-pdp-image"] img').each((_, el) => {
        const src = $(el).attr('src');
        if (src && !seen.has(src)) {
          out.push(src);
          seen.add(src);
        }
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

    // If the static page yielded nothing useful, the listing was likely
    // hydrated client-side — surface a warning so the caller can fall back
    // to the extension DOM extractor.
    if (!title && price === 0 && images.length === 0) {
      console.warn(
        '[facebook] static HTML looked empty — page may be JS-rendered or bot-blocked:',
        url,
      );
    }

    return {
      title,
      price,
      currency,
      description,
      seller,
      images,
      postedDate,
      url,
      marketplace: 'facebook',
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
        `[facebook] failed to extract ${field}:`,
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
