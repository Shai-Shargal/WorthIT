import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketObservation } from '../src/types.js';

vi.mock('../src/services/marketObservations.js', () => ({
  findSimilarObservations: vi.fn(),
}));

vi.mock('../src/services/marketData/index.js', () => ({
  getSeedObservations: vi.fn(),
}));

import { buildMarketContexts } from '../src/services/marketContext.js';
import { findSimilarObservations } from '../src/services/marketObservations.js';
import { getSeedObservations } from '../src/services/marketData/index.js';

const findMock = vi.mocked(findSimilarObservations);
const seedMock = vi.mocked(getSeedObservations);

function obs(overrides: Partial<MarketObservation> = {}): MarketObservation {
  return {
    productName: 'iPhone 13',
    observedPrice: 2000,
    currency: 'ILS',
    source: 'yad2',
    timestamp: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  findMock.mockReset();
  seedMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildMarketContexts', () => {
  it('builds a local context from recent observations and flags low counts', async () => {
    findMock.mockImplementation(async ({ sinceDays }) => {
      if (typeof sinceDays === 'number') {
        return [
          obs({ observedPrice: 1800 }),
          obs({ observedPrice: 2000 }),
        ];
      }
      return [];
    });

    const { localMarketContext, historicalContext } = await buildMarketContexts({
      name: 'iPhone 13',
      currency: 'ILS',
    });

    expect(localMarketContext.observationCount).toBe(2);
    expect(localMarketContext.typicalPrice?.p50).toBeGreaterThan(0);
    expect(localMarketContext.priceRange).toEqual({ min: 1800, max: 2000 });
    expect(localMarketContext.notes.some((n) => n.toLowerCase().includes('limited'))).toBe(true);
    expect(historicalContext.totalObservations).toBe(0);
    expect(seedMock).not.toHaveBeenCalled();
  });

  it('falls back to seed observations when nothing is stored locally', async () => {
    findMock.mockResolvedValue([]);
    seedMock.mockResolvedValue([
      obs({ source: 'static-seed', observedPrice: 1900 }),
      obs({ source: 'static-seed', observedPrice: 2100 }),
      obs({ source: 'static-seed', observedPrice: 2300 }),
      obs({ source: 'static-seed', observedPrice: 2500 }),
    ]);

    const { localMarketContext } = await buildMarketContexts({
      name: 'iPhone 13',
      currency: 'ILS',
    });

    expect(seedMock).toHaveBeenCalledOnce();
    expect(localMarketContext.observationCount).toBe(4);
    expect(localMarketContext.notes.some((n) => n.toLowerCase().includes('seed'))).toBe(true);
  });

  it('builds historical context from older observations with oldest/newest stamps', async () => {
    findMock.mockImplementation(async ({ olderThanDays }) => {
      if (typeof olderThanDays === 'number') {
        return [
          obs({ observedPrice: 1700, timestamp: new Date('2025-09-01T00:00:00Z') }),
          obs({ observedPrice: 1900, timestamp: new Date('2025-06-15T00:00:00Z') }),
          obs({ observedPrice: 2100, timestamp: new Date('2025-12-01T00:00:00Z') }),
        ];
      }
      return [obs()];
    });

    const { historicalContext } = await buildMarketContexts({
      name: 'iPhone 13',
      currency: 'ILS',
    });

    expect(historicalContext.totalObservations).toBe(3);
    expect(historicalContext.oldestTimestamp?.toISOString()).toBe('2025-06-15T00:00:00.000Z');
    expect(historicalContext.newestTimestamp?.toISOString()).toBe('2025-12-01T00:00:00.000Z');
  });
});
