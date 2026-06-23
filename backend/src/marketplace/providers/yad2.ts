import type { IMarketplaceExtractor, RawListing, RawSeller } from '../IMarketplaceExtractor.js';

/**
 * Yad2 (yad2.co.il) listing extractor — Tavily-backed.
 *
 * Yad2 item pages are a heavily hydrated Next.js app, so naive HTML scraping
 * yields almost nothing beyond the OpenGraph title. Instead, this extractor:
 *
 *   1. Parses the Yad2 URL for a stable product identifier (item slug/ID).
 *   2. Issues a Tavily web search for "Yad2 <identifier>" plus a Hebrew
 *      variant, harvesting snippets that mention the listing.
 *   3. Parses the snippets for price (₪/NIS/ILS), description, and seller.
 *   4. Returns a normalized {@link RawListing} (marketplace = 'yad2').
 *
 * Edge cases:
 * - Missing `TAVILY_API_KEY`           → returns a partial listing built from
 *                                        URL-derived data only (no throw).
 * - Tavily returns no usable results   → returns a partial listing (title
 *                                        falls back to the product id).
 * - Tavily request errors / timeout    → caught & logged; partial listing is
 *                                        returned so callers can still
 *                                        surface "data unavailable" to the
 *                                        user instead of an exception.
 * - Invalid Yad2 URL                   → validateUrl() returns false and
 *                                        extractListing() throws.
 */

const YAD2_HOST_REGEX = /^(?:www\.|m\.)?yad2\.co\.il$/i;
const YAD2_ITEM_PATH_PREFIX = '/item/';
const TAVILY_API_URL = 'https://api.tavily.com/search';
const TAVILY_TIMEOUT_MS = 10_000;
const TAVILY_MAX_RESULTS = 5;

/** Tavily search result item — subset of fields we actually consume. */
interface TavilyResult {
  title?: string;
  content?: string;
  snippet?: string;
  url?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
  answer?: string;
}

/**
 * Match ILS prices in either symbol-first or symbol-last form, in both
 * Hebrew (₪ / ש"ח) and Latin (ILS / NIS) notations.
 */
const PRICE_REGEX =
  /(?:₪|ש["״]ח|שח|ILS|NIS)\s*([0-9][0-9,]*(?:\.[0-9]+)?)|([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:₪|ש["״]ח|שח|ILS|NIS)/gi;

/** Extract every plausible price found in `text`. */
function extractPrices(text: string): number[] {
  const out: number[] = [];
  if (!text) return out;
  PRICE_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRICE_REGEX.exec(text)) !== null) {
    const raw = (m[1] ?? m[2]).replace(/,/g, '');
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n > 0 && n < 10_000_000) out.push(n);
  }
  return out;
}

export class Yad2Extractor implements IMarketplaceExtractor {
  /**
   * Static form of {@link Yad2Extractor.validateUrl} so the
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
    if (!YAD2_HOST_REGEX.test(parsed.hostname)) return false;
    return parsed.pathname.startsWith(YAD2_ITEM_PATH_PREFIX);
  }

  validateUrl(url: string): boolean {
    return Yad2Extractor.validateUrl(url);
  }

  /**
   * Extract a stable product identifier from a Yad2 item URL.
   * For `/item/abc123` returns `"abc123"`; for nested paths it returns the
   * last non-empty segment. Returns `undefined` when nothing usable is found.
   */
  extractProductId(url: string): string | undefined {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      // Drop the leading "item" segment when present.
      const tail = segments[0]?.toLowerCase() === 'item' ? segments.slice(1) : segments;
      const last = tail[tail.length - 1];
      if (!last) return undefined;
      // Strip query-ish suffixes just in case ("abc123.html" → "abc123").
      const cleaned = last.replace(/\.[a-z0-9]+$/i, '').trim();
      return cleaned || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Parse a date string. Supports ISO-8601 and the `DD/MM/YYYY` (or
   * `DD.MM.YYYY`) Israeli format that often shows up in Tavily snippets.
   */
  parseDate(dateStr: string | undefined | null): Date | undefined {
    if (!dateStr) return undefined;
    const trimmed = dateStr.trim();
    if (!trimmed) return undefined;

    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const d = new Date(trimmed);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }

    const m = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
    if (m) {
      const day = Number.parseInt(m[1], 10);
      const month = Number.parseInt(m[2], 10) - 1;
      let year = Number.parseInt(m[3], 10);
      if (year < 100) year += 2000;
      const d = new Date(year, month, day);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }

    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  /**
   * Run a single Tavily query. Returns the parsed body, or `undefined` on
   * any failure (network, non-2xx, timeout, missing API key). Never throws.
   */
  async tavilySearch(query: string): Promise<TavilyResponse | undefined> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      console.warn('[yad2] TAVILY_API_KEY not set — skipping Tavily search');
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);
    try {
      const response = await fetch(TAVILY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: 'advanced',
          include_answer: true,
          max_results: TAVILY_MAX_RESULTS,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn(`[yad2] Tavily HTTP ${response.status} for query: ${query}`);
        return undefined;
      }

      return (await response.json()) as TavilyResponse;
    } catch (err) {
      console.warn(
        '[yad2] Tavily search failed:',
        err instanceof Error ? err.message : err,
      );
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  async extractListing(url: string): Promise<RawListing> {
    if (!this.validateUrl(url)) {
      throw new Error(`Yad2Extractor: invalid Yad2 URL: ${url}`);
    }

    const productId = this.extractProductId(url);

    // No product id we can search for → return a minimally-populated listing
    // rather than throwing, matching the "missing product name → handle
    // gracefully" requirement.
    if (!productId) {
      console.warn('[yad2] could not extract product id from URL:', url);
      return this.buildEmptyListing(url, '');
    }

    const queries = [
      `Yad2 ${productId}`,
      `יד2 ${productId} מחיר`,
    ];

    const responses: TavilyResponse[] = [];
    for (const q of queries) {
      const r = await this.tavilySearch(q);
      if (r) responses.push(r);
    }

    if (responses.length === 0) {
      // Tavily unavailable or returned nothing usable — partial data is fine.
      console.warn('[yad2] no Tavily results for', url, '— returning partial listing');
      return this.buildEmptyListing(url, productId);
    }

    return this.parseTavilyResults(responses, url, productId);
  }

  /**
   * Pure parser over Tavily responses. Extracted so the unit tests can call
   * it directly without re-mocking `fetch` for every shape variation.
   */
  parseTavilyResults(
    responses: TavilyResponse[],
    url: string,
    productId: string,
  ): RawListing {
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
          const sellerName = this.extractSellerName([r.title, r.content, r.snippet]);
          if (sellerName) {
            seller = { name: sellerName, profileUrl: r.url };
          }
        }
      }
    }

    // Title: prefer the first Yad2-like title from results, else fall back
    // to the product id so callers never see an empty string when we DID
    // get a response.
    const title = this.pickTitle(titles) ?? productId;

    // Price: collect all candidate prices across snippets and pick the
    // median — this is robust to outlier "starting from ₪X" / "compare at"
    // numbers that pollute the snippets.
    const prices = snippets.flatMap((s) => extractPrices(s));
    const price = prices.length > 0 ? this.median(prices) : 0;

    // Description: longest snippet wins. Tavily often returns the listing
    // body verbatim as `content`.
    const description = this.pickDescription(snippets);

    // Posted date: try to find an ISO or DD/MM/YYYY date in any snippet.
    const postedDate = this.findDate(snippets);

    return {
      title,
      price,
      currency: 'ILS',
      description,
      seller,
      images: [], // Tavily snippets don't reliably surface image URLs.
      postedDate,
      url,
      marketplace: 'yad2',
    };
  }

  /** Build a partial listing for the cases where Tavily gave us nothing. */
  private buildEmptyListing(url: string, fallbackTitle: string): RawListing {
    return {
      title: fallbackTitle,
      price: 0,
      currency: 'ILS',
      description: undefined,
      seller: undefined,
      images: [],
      postedDate: undefined,
      url,
      marketplace: 'yad2',
    };
  }

  /** Pick the first reasonable title — non-empty, not just the bare host. */
  private pickTitle(titles: string[]): string | undefined {
    for (const t of titles) {
      const cleaned = t.trim();
      if (!cleaned) continue;
      if (/^yad2(\.co\.il)?$/i.test(cleaned)) continue;
      return cleaned;
    }
    return undefined;
  }

  /** Longest snippet — heuristic for "the description". */
  private pickDescription(snippets: string[]): string | undefined {
    let best: string | undefined;
    for (const s of snippets) {
      const t = s.trim();
      if (!t) continue;
      if (!best || t.length > best.length) best = t;
    }
    return best;
  }

  /** Try to mine a date from any snippet. */
  private findDate(snippets: string[]): Date | undefined {
    for (const s of snippets) {
      const isoMatch = s.match(/\b(\d{4}-\d{2}-\d{2}(?:T[\d:.+\-Z]+)?)\b/);
      if (isoMatch) {
        const d = this.parseDate(isoMatch[1]);
        if (d) return d;
      }
      const dmyMatch = s.match(/\b(\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/);
      if (dmyMatch) {
        const d = this.parseDate(dmyMatch[1]);
        if (d) return d;
      }
    }
    return undefined;
  }

  /**
   * Tavily sometimes returns titles shaped like
   *   "iPhone 13 — Yad2 — by Danny"
   * so when a Tavily result URL clearly belongs to a seller profile we
   * scrape the trailing "by <name>" fragment for a seller name.
   */
  private extractSellerName(
    fields: Array<string | undefined>,
  ): string | undefined {
    const candidates = fields.filter(
      (s): s is string => typeof s === 'string' && s.length > 0,
    );
    for (const c of candidates) {
      const byMatch = c.match(/(?:by|seller|מוכר|מאת)\s*[:\-]?\s*([A-Za-z֐-׿][\w֐-׿\s.'-]{1,40})/i);
      if (byMatch) {
        // Stop at the first sentence boundary / punctuation that wouldn't
        // belong in a person/business name.
        const cleaned = byMatch[1].trim().split(/[.;,!?\n]/)[0].trim();
        if (cleaned) return cleaned;
      }
    }
    return undefined;
  }

  /** Median of a non-empty number list. */
  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  }
}
