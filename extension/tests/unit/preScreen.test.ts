import { describe, it, expect } from 'vitest';
import { hasRedFlag, preScreen } from '../../src/marketplace/preScreen.js';
import type { ObservedListing } from '../../src/marketplace/types.js';

function makeListing(overrides: Partial<ObservedListing> = {}): ObservedListing {
  return {
    marketplace: 'facebook',
    listingId: '1',
    listingUrl: '/marketplace/item/1',
    title: 'PS5 Console',
    price: 1500,
    currency: 'ILS',
    searchQuery: 'ps5',
    observedAt: new Date(),
    ...overrides,
  };
}

describe('hasRedFlag', () => {
  it('returns false for a clean title', () => {
    expect(hasRedFlag('PS5 Console 256GB')).toBe(false);
  });
  it('detects English as-is', () => {
    expect(hasRedFlag('PS5 as is, works')).toBe(true);
  });
  it('detects Hebrew כפי שהוא', () => {
    expect(hasRedFlag('פלייסטיישן 5 כפי שהוא')).toBe(true);
  });
  it('detects untested', () => {
    expect(hasRedFlag('MacBook untested')).toBe(true);
  });
  it('detects לא בדוק', () => {
    expect(hasRedFlag('מחשב לא בדוק')).toBe(true);
  });
  it('detects חייב למכור', () => {
    expect(hasRedFlag('חייב למכור PS5')).toBe(true);
  });
  it('detects urgent', () => {
    expect(hasRedFlag('urgent sale PS5')).toBe(true);
  });
  it('detects ללא מטען', () => {
    expect(hasRedFlag('MacBook Air ללא מטען')).toBe(true);
  });
  it('detects no charger', () => {
    expect(hasRedFlag('MacBook no charger')).toBe(true);
  });
  it('detects שלט אחד', () => {
    expect(hasRedFlag('PS5 שלט אחד בלבד')).toBe(true);
  });
  it('detects one controller', () => {
    expect(hasRedFlag('PS5 one controller only')).toBe(true);
  });
  it('detects כנסו לתיאור', () => {
    expect(hasRedFlag('כנסו לתיאור')).toBe(true);
  });
  it('is case-insensitive for English patterns', () => {
    expect(hasRedFlag('PS5 AS IS condition')).toBe(true);
  });
});

describe('preScreen', () => {
  it('returns empty array for empty input', () => {
    expect(preScreen([])).toEqual([]);
  });
  it('sorts clean listings by price ascending', () => {
    const a = makeListing({ listingId: '1', price: 2000 });
    const b = makeListing({ listingId: '2', price: 1000 });
    const c = makeListing({ listingId: '3', price: 1500 });
    expect(preScreen([a, b, c]).map((l) => l.price)).toEqual([1000, 1500, 2000]);
  });
  it('puts red-flagged listings after clean ones regardless of price', () => {
    const clean = makeListing({ listingId: '1', title: 'PS5 Console', price: 1000 });
    const flagged = makeListing({ listingId: '2', title: 'PS5 as is', price: 500 });
    const result = preScreen([flagged, clean]);
    expect(result[0].listingId).toBe('1');
    expect(result[1].listingId).toBe('2');
  });
  it('returns all listings when count is below topN', () => {
    const listings = [makeListing({ listingId: '1' }), makeListing({ listingId: '2' })];
    expect(preScreen(listings, 5)).toHaveLength(2);
  });
  it('truncates to topN', () => {
    const listings = Array.from({ length: 10 }, (_, i) =>
      makeListing({ listingId: String(i), price: i * 100 }),
    );
    expect(preScreen(listings, 5)).toHaveLength(5);
  });
  it('returns cheapest flagged listings when all are red-flagged', () => {
    const a = makeListing({ listingId: '1', title: 'PS5 as is', price: 2000 });
    const b = makeListing({ listingId: '2', title: 'iPad untested', price: 500 });
    const result = preScreen([a, b], 5);
    expect(result).toHaveLength(2);
    expect(result[0].price).toBe(500);
  });
  it('uses default topN of 5', () => {
    const listings = Array.from({ length: 8 }, (_, i) =>
      makeListing({ listingId: String(i) }),
    );
    expect(preScreen(listings)).toHaveLength(5);
  });
});
