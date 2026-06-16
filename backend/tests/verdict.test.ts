import { describe, expect, it } from 'vitest';
import type { ListingSnapshot, LocalMarketContext } from '../../shared/types/index.js';
import { computeVerdict } from '../src/analysis/verdict.js';

function listing(price: number): ListingSnapshot {
  return {
    title: 'iPhone 13',
    price,
    currency: 'ILS',
    source: 'facebook',
    observedAt: new Date(),
  };
}

function context(overrides: Partial<LocalMarketContext> = {}): LocalMarketContext {
  return {
    query: 'iPhone 13',
    currency: 'ILS',
    observationCount: 5,
    dataQuality: 'real',
    priceRange: { min: 1800, max: 2400 },
    typicalPrice: { p25: 1900, p50: 2050, p75: 2200 },
    recentObservations: [],
    notes: [],
    ...overrides,
  };
}

describe('computeVerdict', () => {
  it('returns worth_it when price is below band', () => {
    const result = computeVerdict({
      listing: listing(1500),
      localMarketContext: context(),
    });
    expect(result.verdict).toBe('worth_it');
    expect(result.worthRating).toBeGreaterThanOrEqual(4);
  });

  it('returns avoid when price is above band', () => {
    const result = computeVerdict({
      listing: listing(2800),
      localMarketContext: context(),
    });
    expect(result.verdict).toBe('avoid');
    expect(result.worthRating).toBeLessThanOrEqual(2);
  });

  it('returns maybe with low confidence when no observations', () => {
    const result = computeVerdict({
      listing: listing(1500),
      localMarketContext: context({
        observationCount: 0,
        typicalPrice: undefined,
        priceRange: undefined,
      }),
    });
    expect(result.verdict).toBe('maybe');
    expect(result.confidenceLevel).toBe('low');
  });
});
