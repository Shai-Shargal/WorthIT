import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketObservation } from '../../shared/types/index.js';

vi.mock('../src/marketplace/marketObservations.js', () => ({
  findSimilarObservations: vi.fn(),
  recordObservations: vi.fn().mockResolvedValue(0),
}));

vi.mock('../src/marketplace/providers/tavily.js', () => ({
  tavilySearch: vi.fn(),
}));

import { gatherPrices } from '../src/marketplace/priceGathering.js';
import { findSimilarObservations } from '../src/marketplace/marketObservations.js';
import { tavilySearch } from '../src/marketplace/providers/tavily.js';

const findMock = vi.mocked(findSimilarObservations);
const tavilyMock = vi.mocked(tavilySearch);

function obs(price: number, source = 'facebook'): MarketObservation {
  return {
    productName: 'iPhone 13',
    observedPrice: price,
    currency: 'ILS',
    source,
    timestamp: new Date('2026-05-01T00:00:00Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tavilyMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('gatherPrices', () => {
  it('skips Tavily when DB has 5 or more recent observations', async () => {
    const fiveObs = [obs(1900), obs(2000), obs(2100), obs(2050), obs(1950)];
    findMock.mockImplementation(async (q) => (q.sinceDays ? fiveObs : []));

    const result = await gatherPrices({ name: 'iPhone 13', currency: 'ILS' });

    expect(tavilyMock).not.toHaveBeenCalled();
    expect(result.sources).toContain('db');
    expect(result.sources).not.toContain('tavily');
    expect(result.localMarketContext.dataQuality).toBe('real');
  });

  it('calls Tavily when DB has fewer than 5 recent observations', async () => {
    findMock.mockImplementation(async (q) => (q.sinceDays ? [obs(2000)] : []));
    tavilyMock.mockResolvedValue([obs(2100, 'tavily'), obs(1900, 'tavily')]);

    const result = await gatherPrices({ name: 'iPhone 13', currency: 'ILS' });

    expect(tavilyMock).toHaveBeenCalledOnce();
    expect(result.sources).toContain('tavily');
    expect(result.recentObservations.length).toBe(3);
  });

  it('sets dataQuality to seed when only Tavily data found', async () => {
    findMock.mockResolvedValue([]);
    tavilyMock.mockResolvedValue([obs(2000, 'tavily')]);

    const result = await gatherPrices({ name: 'Unknown Product', currency: 'ILS' });

    expect(result.localMarketContext.dataQuality).toBe('seed');
  });

  it('sets dataQuality to limited when DB has < 5 real observations and Tavily is empty', async () => {
    findMock.mockImplementation(async (q) => (q.sinceDays ? [obs(2000), obs(1900)] : []));
    tavilyMock.mockResolvedValue([]);

    const result = await gatherPrices({ name: 'iPhone 13', currency: 'ILS' });

    expect(result.localMarketContext.dataQuality).toBe('limited');
  });

  it('builds historicalContext from older observations', async () => {
    findMock.mockImplementation(async (q) => {
      if (q.sinceDays) return [];
      if (q.olderThanDays) return [obs(1800), obs(1700)];
      return [];
    });

    const result = await gatherPrices({ name: 'iPhone 13', currency: 'ILS' });

    expect(result.historicalContext.totalObservations).toBe(2);
  });

  it('continues gracefully when Tavily throws', async () => {
    findMock.mockResolvedValue([]);
    tavilyMock.mockRejectedValue(new Error('Tavily down'));

    const result = await gatherPrices({ name: 'Guitar', currency: 'ILS' });

    expect(result.recentObservations).toEqual([]);
    expect(result.localMarketContext.dataQuality).toBe('insufficient');
  });
});
