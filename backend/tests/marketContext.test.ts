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
