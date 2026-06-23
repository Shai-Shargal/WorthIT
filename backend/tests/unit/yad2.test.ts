import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Yad2Extractor } from '../../src/marketplace/providers/yad2.js';

const VALID_URL = 'https://www.yad2.co.il/item/abc123';

/**
 * Build a minimal-but-realistic Yad2 listing HTML page.
 * Selectors here MUST match the spec in task-1-brief.md.
 */
function buildYad2Html(opts: {
  title?: string;
  price?: string;
  description?: string;
  sellerName?: string;
  sellerHref?: string;
  images?: string[];
  date?: string;
  dateAttr?: string;
  useDataTestId?: boolean;
} = {}): string {
  const {
    title = 'iPhone 13 Pro 256GB',
    price = '₪ 2,500',
    description = 'מצב מעולה, סוללה 95%',
    sellerName = 'דני',
    sellerHref = '/profile/danny',
    images = [
      'https://img.yad2.co.il/listing/abc/1.jpg',
      'https://img.yad2.co.il/listing/abc/2.jpg',
    ],
    date = '15/06/2026',
    dateAttr = '2026-06-15T10:00:00Z',
    useDataTestId = false,
  } = opts;

  const titleEl = useDataTestId
    ? `<div data-testid="item-title">${title}</div>`
    : `<h1 class="item-title">${title}</h1>`;
  const priceEl = useDataTestId
    ? `<div data-testid="price">${price}</div>`
    : `<span class="price-value">${price}</span>`;
  const sellerEl = useDataTestId
    ? `<a data-testid="seller-profile" href="${sellerHref}">${sellerName}</a>`
    : `<a class="seller-name" href="${sellerHref}">${sellerName}</a>`;
  const dateEl = useDataTestId
    ? `<time datetime="${dateAttr}">${date}</time>`
    : `<span class="posted-date">${date}</span>`;
  const imgEls = images.map((src) => `<img class="item-image" src="${src}" />`).join('\n');

  return `
    <html>
      <body>
        ${titleEl}
        ${priceEl}
        <div class="item-description">${description}</div>
        ${sellerEl}
        ${imgEls}
        ${dateEl}
      </body>
    </html>
  `;
}

function mockFetchOnceWithHtml(html: string, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: async () => html,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
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

  describe('extractListing — happy path', () => {
    it('extracts every field from a well-formed Yad2 page', async () => {
      mockFetchOnceWithHtml(buildYad2Html());
      const x = new Yad2Extractor();
      const result = await x.extractListing(VALID_URL);

      expect(result.title).toBe('iPhone 13 Pro 256GB');
      expect(result.price).toBe(2500);
      expect(result.currency).toBe('ILS');
      expect(result.description).toBe('מצב מעולה, סוללה 95%');
      expect(result.seller?.name).toBe('דני');
      expect(result.seller?.profileUrl).toContain('/profile/danny');
      expect(result.images).toHaveLength(2);
      expect(result.images[0]).toBe('https://img.yad2.co.il/listing/abc/1.jpg');
      expect(result.postedDate).toBeInstanceOf(Date);
      expect(result.url).toBe(VALID_URL);
      expect(result.marketplace).toBe('yad2');
    });

    it('falls back to data-testid selectors when primary class selectors absent', async () => {
      mockFetchOnceWithHtml(buildYad2Html({ useDataTestId: true }));
      const x = new Yad2Extractor();
      const result = await x.extractListing(VALID_URL);

      expect(result.title).toBe('iPhone 13 Pro 256GB');
      expect(result.price).toBe(2500);
      expect(result.seller?.name).toBe('דני');
      expect(result.postedDate).toBeInstanceOf(Date);
    });
  });

  describe('extractListing — edge cases', () => {
    it('rejects URLs that fail validateUrl', async () => {
      const x = new Yad2Extractor();
      await expect(x.extractListing('https://example.com/foo')).rejects.toThrow();
    });

    it('returns price=0 when price markup is malformed', async () => {
      const html = buildYad2Html({ price: 'price on request' });
      mockFetchOnceWithHtml(html);
      const x = new Yad2Extractor();
      const result = await x.extractListing(VALID_URL);
      expect(result.price).toBe(0);
    });

    it('returns empty images array when gallery is missing', async () => {
      const html = buildYad2Html({ images: [] });
      mockFetchOnceWithHtml(html);
      const x = new Yad2Extractor();
      const result = await x.extractListing(VALID_URL);
      expect(result.images).toEqual([]);
    });

    it('returns undefined for optional fields when DOM lacks them', async () => {
      const html = `
        <html><body>
          <h1 class="item-title">Bare Listing</h1>
          <span class="price-value">₪ 100</span>
        </body></html>
      `;
      mockFetchOnceWithHtml(html);
      const x = new Yad2Extractor();
      const result = await x.extractListing(VALID_URL);

      expect(result.title).toBe('Bare Listing');
      expect(result.price).toBe(100);
      expect(result.description).toBeUndefined();
      expect(result.seller).toBeUndefined();
      expect(result.postedDate).toBeUndefined();
      expect(result.images).toEqual([]);
    });

    it('returns title="" and price=0 on completely malformed HTML rather than crashing', async () => {
      mockFetchOnceWithHtml('<html><body><div>nothing useful</div></body></html>');
      const x = new Yad2Extractor();
      const result = await x.extractListing(VALID_URL);
      expect(result.title).toBe('');
      expect(result.price).toBe(0);
      expect(result.images).toEqual([]);
    });

    it('retries once on fetch timeout, then succeeds', async () => {
      const html = buildYad2Html();
      const fetchMock = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({ ok: true, status: 200, text: async () => html });
      vi.stubGlobal('fetch', fetchMock);

      const x = new Yad2Extractor();
      const result = await x.extractListing(VALID_URL);
      expect(result.title).toBe('iPhone 13 Pro 256GB');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('throws after second fetch failure', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('timeout'));
      vi.stubGlobal('fetch', fetchMock);

      const x = new Yad2Extractor();
      await expect(x.extractListing(VALID_URL)).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('throws when fetch returns non-OK twice', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => '' });
      vi.stubGlobal('fetch', fetchMock);

      const x = new Yad2Extractor();
      await expect(x.extractListing(VALID_URL)).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(2);
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

  describe('fetchPage', () => {
    it('returns the body text on success', async () => {
      mockFetchOnceWithHtml('<html>hi</html>');
      const x = new Yad2Extractor();
      const html = await x.fetchPage(VALID_URL);
      expect(html).toContain('<html>hi</html>');
    });
  });
});
