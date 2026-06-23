import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Yad2Extractor } from '../../src/marketplace/providers/yad2.js';

const VALID_URL = 'https://www.yad2.co.il/item/abc123';

/**
 * Tavily search responses we want the extractor to parse. Mirrors the subset
 * of fields the production code consumes (`answer`, `results[].title`,
 * `results[].content`, `results[].snippet`, `results[].url`).
 */
interface TavilyResultFixture {
  title?: string;
  content?: string;
  snippet?: string;
  url?: string;
}
interface TavilyResponseFixture {
  answer?: string;
  results?: TavilyResultFixture[];
}

/**
 * Build a realistic Tavily response that mentions a Yad2 listing.
 * One Tavily request → one TavilyResponse; we usually issue two queries so
 * the extractor sees an array of two responses. The mock returns the same
 * payload for every call by default — override per-test with mockFetchSequence.
 */
function buildTavilyFixture(opts: {
  title?: string;
  price?: string;
  description?: string;
  sellerName?: string;
  sellerUrl?: string;
  answerExtra?: string;
  date?: string;
} = {}): TavilyResponseFixture {
  const {
    title = 'iPhone 13 Pro 256GB on Yad2',
    price = '₪ 2,500',
    description = 'מצב מעולה, סוללה 95% — iPhone 13 Pro 256GB באחריות.',
    sellerName = 'Danny',
    sellerUrl = 'https://www.yad2.co.il/profile/danny',
    answerExtra = '',
    date = '15/06/2026',
  } = opts;

  return {
    answer: `Listing posted ${date}. Price: ${price}. ${answerExtra}`.trim(),
    results: [
      {
        title,
        content: `${description} מחיר ${price}. Posted ${date}.`,
        url: sellerUrl,
        snippet: `by ${sellerName}`,
      },
    ],
  };
}

/**
 * Make `fetch` return the same Tavily payload for every call.
 * The extractor issues two queries — both get the same response.
 */
function mockTavilyFetchAlways(payload: TavilyResponseFixture | undefined, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Sequence-based fetch mock for tests that want different responses per call. */
function mockTavilyFetchSequence(
  responses: Array<{ payload?: TavilyResponseFixture; status?: number; error?: Error }>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn();
  for (const r of responses) {
    if (r.error) {
      fetchMock.mockRejectedValueOnce(r.error);
    } else {
      fetchMock.mockResolvedValueOnce({
        ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300,
        status: r.status ?? 200,
        json: async () => r.payload,
      });
    }
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TAVILY_API_KEY = 'test-key';
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TAVILY_API_KEY;
});

describe('Yad2Extractor', () => {
  describe('validateUrl', () => {
    it('accepts canonical yad2 item URL', () => {
      const x = new Yad2Extractor();
      expect(x.validateUrl('https://www.yad2.co.il/item/abc123')).toBe(true);
    });

    it('accepts yad2 item URL without www', () => {
      const x = new Yad2Extractor();
      expect(x.validateUrl('https://yad2.co.il/item/xyz')).toBe(true);
    });

    it('rejects unrelated marketplace URLs', () => {
      const x = new Yad2Extractor();
      expect(x.validateUrl('https://www.facebook.com/marketplace/item/1')).toBe(false);
      expect(x.validateUrl('https://www.yad2.co.il/realestate/forsale/123')).toBe(false);
    });

    it('rejects malformed input', () => {
      const x = new Yad2Extractor();
      expect(x.validateUrl('not a url')).toBe(false);
      expect(x.validateUrl('')).toBe(false);
    });
  });

  describe('extractProductId', () => {
    it('returns the slug for /item/<id> and undefined for garbage', () => {
      const x = new Yad2Extractor();
      expect(x.extractProductId('https://www.yad2.co.il/item/abc123')).toBe('abc123');
      expect(x.extractProductId('not a url')).toBeUndefined();
    });
  });

  describe('extractListing — happy path', () => {
    it('extracts title, price, description, seller and date from Tavily results', async () => {
      mockTavilyFetchAlways(buildTavilyFixture());
      const x = new Yad2Extractor();
      const result = await x.extractListing(VALID_URL);

      expect(result.title).toBe('iPhone 13 Pro 256GB on Yad2');
      expect(result.price).toBe(2500);
      expect(result.currency).toBe('ILS');
      expect(result.description).toContain('iPhone 13 Pro 256GB');
      expect(result.seller?.name).toBe('Danny');
      expect(result.seller?.profileUrl).toContain('/profile/danny');
      expect(result.postedDate).toBeInstanceOf(Date);
      expect(result.url).toBe(VALID_URL);
      expect(result.marketplace).toBe('yad2');
      // Tavily snippets don't reliably surface image URLs → empty array.
      expect(result.images).toEqual([]);
    });

    it('picks the median price when snippets mention multiple ILS amounts', async () => {
      const payload: TavilyResponseFixture = {
        answer: 'Range observed: ₪2,300 – ₪2,800 across listings.',
        results: [
          { title: 'iPhone 13 Yad2', content: 'iPhone 13 listed at ₪2,500', url: 'https://www.yad2.co.il/profile/x' },
          { title: 'iPhone 13 comparison', content: 'similar models go for ₪2,400 and ₪2,600', url: 'https://x' },
        ],
      };
      mockTavilyFetchAlways(payload);
      const x = new Yad2Extractor();
      const result = await x.extractListing(VALID_URL);
      // Sorted prices across both queries (duplicated): 2300,2300,2400,2400,2500,2500,2600,2600,2800,2800 → median 2500.
      expect(result.price).toBe(2500);
    });
  });

  describe('extractListing — edge cases', () => {
    it('rejects URLs that fail validateUrl', async () => {
      const x = new Yad2Extractor();
      await expect(x.extractListing('https://example.com/foo')).rejects.toThrow();
    });

    it('returns price=0 when Tavily snippets contain no recognizable price', async () => {
      mockTavilyFetchAlways({
        answer: 'price on request',
        results: [{ title: 'Yad2 listing', content: 'no price quoted here', url: 'https://x' }],
      });
      const x = new Yad2Extractor();
      const result = await x.extractListing(VALID_URL);
      expect(result.price).toBe(0);
    });

    it('returns partial listing when Tavily returns zero results', async () => {
      mockTavilyFetchAlways({ answer: '', results: [] });
      const x = new Yad2Extractor();
      const result = await x.extractListing(VALID_URL);

      // No usable data → title falls back to the product id, optional fields undefined.
      expect(result.title).toBe('abc123');
      expect(result.price).toBe(0);
      expect(result.description).toBeUndefined();
      expect(result.seller).toBeUndefined();
      expect(result.postedDate).toBeUndefined();
      expect(result.images).toEqual([]);
      expect(result.marketplace).toBe('yad2');
    });

    it('returns partial listing when Tavily HTTP fails twice (one per query)', async () => {
      mockTavilyFetchSequence([
        { status: 503 },
        { status: 503 },
      ]);
      const x = new Yad2Extractor();
      const result = await x.extractListing(VALID_URL);
      expect(result.title).toBe('abc123');
      expect(result.price).toBe(0);
    });

    it('returns partial listing when fetch throws (network error / timeout)', async () => {
      mockTavilyFetchSequence([
        { error: new Error('network down') },
        { error: new Error('network down') },
      ]);
      const x = new Yad2Extractor();
      const result = await x.extractListing(VALID_URL);
      expect(result.title).toBe('abc123');
      expect(result.price).toBe(0);
      expect(result.images).toEqual([]);
    });

    it('returns partial listing when TAVILY_API_KEY is missing', async () => {
      delete process.env.TAVILY_API_KEY;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const x = new Yad2Extractor();
      const result = await x.extractListing(VALID_URL);

      expect(result.title).toBe('abc123');
      expect(result.price).toBe(0);
      // No API key → must not have hit the network.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('issues exactly two Tavily queries (English + Hebrew) per call', async () => {
      const fetchMock = mockTavilyFetchAlways(buildTavilyFixture());
      const x = new Yad2Extractor();
      await x.extractListing(VALID_URL);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('parseTavilyResults', () => {
    it('falls back to the product id when no titles look usable', () => {
      const x = new Yad2Extractor();
      const result = x.parseTavilyResults(
        [{ answer: '', results: [{ title: 'Yad2', content: '₪500', url: 'https://x' }] }],
        VALID_URL,
        'abc123',
      );
      // Bare "Yad2" titles are filtered → fallback to productId.
      expect(result.title).toBe('abc123');
      expect(result.price).toBe(500);
      expect(result.marketplace).toBe('yad2');
    });
  });

  describe('parseDate', () => {
    it('parses ISO datetime attribute', () => {
      const x = new Yad2Extractor();
      const d = x.parseDate('2026-06-15T10:00:00Z');
      expect(d).toBeInstanceOf(Date);
      expect(d?.getUTCFullYear()).toBe(2026);
      expect(d?.getUTCMonth()).toBe(5);
      expect(d?.getUTCDate()).toBe(15);
    });

    it('parses DD/MM/YYYY Israeli format', () => {
      const x = new Yad2Extractor();
      const d = x.parseDate('15/06/2026');
      expect(d).toBeInstanceOf(Date);
      expect(d?.getFullYear()).toBe(2026);
      expect(d?.getMonth()).toBe(5);
      expect(d?.getDate()).toBe(15);
    });

    it('returns undefined on garbage input', () => {
      const x = new Yad2Extractor();
      expect(x.parseDate('not a date')).toBeUndefined();
      expect(x.parseDate('')).toBeUndefined();
    });
  });
});
