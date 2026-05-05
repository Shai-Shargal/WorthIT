import { describe, expect, it } from 'vitest';
import { makeListingId, parsePrice, toAbsoluteUrl } from '../src/services/scraper/utils.js';

describe('scraper utils', () => {
  it('parses common price formats', () => {
    expect(parsePrice('₪ 2,450')).toBe(2450);
    expect(parsePrice('$899')).toBe(899);
    expect(parsePrice('NIS 1,200')).toBe(1200);
  });

  it('creates absolute URLs', () => {
    expect(toAbsoluteUrl('/marketplace/item/123', 'https://www.facebook.com')).toBe(
      'https://www.facebook.com/marketplace/item/123',
    );
  });

  it('creates stable listing id format', () => {
    expect(makeListingId('facebook', 'iPhone 13 128GB', 2)).toContain('facebook-');
  });
});

