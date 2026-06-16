import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketObservation } from '../../shared/types/index.js';

vi.mock('../src/marketplace/marketObservations.js', () => ({
  findSimilarObservations: vi.fn(),
}));

vi.mock('../src/marketplace/seed.js', () => ({
  getSeedObservations: vi.fn(),
}));

import { buildMarketContexts } from '../src/marketplace/marketContext.js';
import { findSimilarObservations } from '../src/marketplace/marketObservations.js';
import { getSeedObservations } from '../src/marketplace/seed.js';

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
  vi.clearAllMocks();
  seedMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildMarketContexts', () => {
  it('uses stored recent observations when available', async () => {
    findMock.mockImplementation(async (q) => {
      if (q.sinceDays) return [obs({ observedPrice: 1900 }), obs({ observedPrice: 2100 })];
      return [];
    });

    const { localMarketContext } = await buildMarketContexts({ name: 'iPhone 13', currency: 'ILS' });
    expect(localMarketContext.observationCount).toBe(2);
    expect(seedMock).not.toHaveBeenCalled();
  });

  it('falls back to seed data when no recent observations exist', async () => {
    findMock.mockResolvedValue([]);
    seedMock.mockResolvedValue([obs({ source: 'static-seed', observedPrice: 2000 })]);

    const { localMarketContext } = await buildMarketContexts({ name: 'iPhone 13', currency: 'ILS' });
    expect(localMarketContext.observationCount).toBe(1);
    expect(localMarketContext.notes.some((n) => n.includes('seed'))).toBe(true);
  });
});

describe('buildMarketContexts — dataQuality', () => {
  it('sets dataQuality to seed when falling back to seed data', async () => {
    findMock.mockResolvedValue([]);
    seedMock.mockResolvedValue([obs({ source: 'static-seed' })]);
    const { localMarketContext } = await buildMarketContexts({ name: 'iPhone 13', currency: 'ILS' });
    expect(localMarketContext.dataQuality).toBe('seed');
  });

  it('sets dataQuality to insufficient when fewer than 5 real observations', async () => {
    findMock.mockImplementation(async (q) => {
      if (q.sinceDays) return [obs(), obs(), obs()]; // 3 real
      return [];
    });
    const { localMarketContext } = await buildMarketContexts({ name: 'iPhone 13', currency: 'ILS' });
    expect(localMarketContext.dataQuality).toBe('insufficient');
  });

  it('sets dataQuality to real when 5 or more real observations', async () => {
    findMock.mockImplementation(async (q) => {
      if (q.sinceDays) return [obs(), obs(), obs(), obs(), obs()]; // 5 real
      return [];
    });
    const { localMarketContext } = await buildMarketContexts({ name: 'iPhone 13', currency: 'ILS' });
    expect(localMarketContext.dataQuality).toBe('real');
  });
});
