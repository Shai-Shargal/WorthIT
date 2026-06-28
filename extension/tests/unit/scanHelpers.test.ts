import { describe, it, expect, beforeEach } from 'vitest';
import { isSearchPage, resolveListingUrl, starsHtml, buildResultCard } from '../../src/popup/scanHelpers.js';
import type { AnalyzeProductResponse } from '../../../shared/types/index.js';

const MOCK_ANALYSIS: AnalyzeProductResponse = {
  analysisId: 'abc123',
  listing: {
    title: 'PS5 Console',
    price: 1500,
    currency: 'ILS',
    source: 'facebook',
    observedAt: new Date(),
  },
  localMarketContext: {
    query: 'ps5',
    currency: 'ILS',
    observationCount: 5,
    dataQuality: 'real',
    recentObservations: [],
    notes: [],
  },
  historicalContext: {
    query: 'ps5',
    totalObservations: 5,
    observations: [],
  },
  verdict: {
    verdict: 'worth_it',
    worthRating: 4,
    confidence: 0.8,
    confidenceLevel: 'high',
  },
  reasoning: {
    summary: 'Good deal',
    positives: ['Reasonable price'],
    concerns: [],
  },
};

describe('isSearchPage', () => {
  it('returns true for city-prefixed search URL', () => {
    expect(isSearchPage('https://www.facebook.com/marketplace/telaviv/search/?query=ps5')).toBe(true);
  });
  it('returns true for bare /marketplace/search URL', () => {
    expect(isSearchPage('https://www.facebook.com/marketplace/search/?query=iphone')).toBe(true);
  });
  it('returns false for item detail page', () => {
    expect(isSearchPage('https://www.facebook.com/marketplace/item/123456')).toBe(false);
  });
  it('returns false for non-marketplace URL', () => {
    expect(isSearchPage('https://www.facebook.com/groups/123')).toBe(false);
  });
  it('returns false for undefined', () => {
    expect(isSearchPage(undefined)).toBe(false);
  });
  it('returns false when query param is absent', () => {
    expect(isSearchPage('https://www.facebook.com/marketplace/telaviv/search/')).toBe(false);
  });
});

describe('resolveListingUrl', () => {
  it('returns absolute URL unchanged', () => {
    expect(resolveListingUrl('https://www.facebook.com/marketplace/item/123')).toBe(
      'https://www.facebook.com/marketplace/item/123',
    );
  });
  it('prepends facebook.com to a root-relative URL', () => {
    expect(resolveListingUrl('/marketplace/item/123')).toBe(
      'https://www.facebook.com/marketplace/item/123',
    );
  });
});

describe('starsHtml', () => {
  it('returns 5 filled stars for rating 5', () => {
    expect(starsHtml(5)).toBe('★★★★★');
  });
  it('returns 3 filled + 2 empty for rating 3', () => {
    expect(starsHtml(3)).toBe('★★★☆☆');
  });
  it('returns all empty for rating 0', () => {
    expect(starsHtml(0)).toBe('☆☆☆☆☆');
  });
  it('clamps values above 5', () => {
    expect(starsHtml(7)).toBe('★★★★★');
  });
});

describe('buildResultCard', () => {
  it('renders rank badge', () => {
    const card = buildResultCard(1, { title: 'PS5', price: 1500, listingUrl: '/marketplace/item/1' }, MOCK_ANALYSIS);
    expect(card.querySelector('.scan-card__rank')?.textContent).toBe('#1');
  });
  it('truncates title longer than 35 chars', () => {
    const longTitle = 'A'.repeat(40);
    const card = buildResultCard(1, { title: longTitle, price: 1500, listingUrl: '/marketplace/item/1' }, MOCK_ANALYSIS);
    expect(card.querySelector('.scan-card__title')?.textContent).toHaveLength(36); // 35 + '…'
  });
  it('does not truncate titles of 35 chars or fewer', () => {
    const card = buildResultCard(1, { title: 'Short title', price: 1500, listingUrl: '/marketplace/item/1' }, MOCK_ANALYSIS);
    expect(card.querySelector('.scan-card__title')?.textContent).toBe('Short title');
  });
  it('renders star rating when analysis is provided', () => {
    const card = buildResultCard(1, { title: 'PS5', price: 1500, listingUrl: '/marketplace/item/1' }, MOCK_ANALYSIS);
    expect(card.querySelector('.scan-card__stars')?.textContent).toBe('★★★★☆'); // rating 4
  });
  it('renders error placeholder when analysis is null', () => {
    const card = buildResultCard(1, { title: 'PS5', price: 1500, listingUrl: '/marketplace/item/1' }, null);
    expect(card.querySelector('.scan-card__error')?.textContent).toBe('⚠ Could not analyze');
  });
  it('renders View link with resolved absolute URL', () => {
    const card = buildResultCard(1, { title: 'PS5', price: 1500, listingUrl: '/marketplace/item/1' }, null);
    const link = card.querySelector('.scan-card__view') as HTMLAnchorElement;
    expect(link?.href).toBe('https://www.facebook.com/marketplace/item/1');
  });
  it('renders price with thousands separator', () => {
    const card = buildResultCard(1, { title: 'PS5', price: 1500, listingUrl: '/marketplace/item/1' }, MOCK_ANALYSIS);
    expect(card.querySelector('.scan-card__price')?.textContent).toContain('1,500');
  });
});
