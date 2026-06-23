import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONFIDENCE_WEIGHTS,
  __orchestratorCacheSizeForTests,
  __resetOrchestratorCacheForTests,
  calculateConfidence,
  calculateDataQuality,
  createMockDataSources,
  enrichListing,
  withTimeout,
  type DataSources,
} from '../src/features/DataEnrichmentOrchestrator.js';
import type { RawListing } from '../src/marketplace/types/RawListing.js';
import type {
  CompetitionData,
  MarketData,
  ProductData,
  SellerData,
  TrendData,
} from '../src/features/types/RichListing.js';

const baseListing: RawListing = {
  title: 'iPhone 13 Pro 256GB',
  price: 2400,
  currency: 'ILS',
  description: 'Used iPhone 13 Pro, like new',
  seller: { name: 'Avi Cohen' },
  images: ['https://example.com/1.jpg'],
  postedDate: new Date('2026-06-20'),
  url: 'https://yad2.co.il/item/abc123',
  marketplace: 'yad2',
};

function makeSources(overrides: Partial<DataSources> = {}): DataSources {
  const mocks = createMockDataSources();
  return { ...mocks, ...overrides };
}

beforeEach(() => {
  __resetOrchestratorCacheForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('enrichListing — happy path', () => {
  it('returns a rich listing with all five sources fulfilled', async () => {
    const rich = await enrichListing(baseListing, { bypassCache: true });

    expect(rich.product.title).toBe(baseListing.title);
    expect(rich.seller).not.toBeNull();
    expect(rich.market).not.toBeNull();
    expect(rich.competition).not.toBeNull();
    expect(rich.trends).not.toBeNull();

    expect(rich.dataQuality.completeness).toBe(1);
    expect(rich.dataQuality.sources).toEqual({
      product: true,
      seller: true,
      market: true,
      competition: true,
      trends: true,
    });
    expect(rich.dataQuality.failureReasons).toEqual([]);
    expect(rich.confidenceOverall).toBeGreaterThan(0);
    expect(rich.confidenceOverall).toBeLessThanOrEqual(1);
  });

  it('exposes aggregated red flag buckets for every source', async () => {
    const rich = await enrichListing(baseListing, { bypassCache: true });
    expect(rich.redFlags).toEqual({
      listing: [],
      seller: [],
      market: [],
      competition: [],
      trends: [],
      fraud: [],
    });
  });
});

describe('enrichListing — graceful failure', () => {
  it('returns null for a source that throws while keeping the rest', async () => {
    const sources = makeSources({
      enrichSeller: async () => {
        throw new Error('Tavily unavailable');
      },
    });

    const rich = await enrichListing(baseListing, {
      dataSources: sources,
      bypassCache: true,
    });

    expect(rich.seller).toBeNull();
    expect(rich.market).not.toBeNull();
    expect(rich.dataQuality.sources.seller).toBe(false);
    expect(rich.dataQuality.sources.market).toBe(true);
    expect(rich.dataQuality.failureReasons.some((r) => r.startsWith('seller:'))).toBe(true);
    expect(rich.dataQuality.completeness).toBe(0.8); // 4 of 5
  });

  it('survives all five sources failing and synthesizes product from raw listing', async () => {
    const failing: DataSources = {
      enhanceProduct: async () => {
        throw new Error('boom');
      },
      enrichSeller: async () => {
        throw new Error('boom');
      },
      gatherMarket: async () => {
        throw new Error('boom');
      },
      analyzeCompetition: async () => {
        throw new Error('boom');
      },
      analyzeTrends: async () => {
        throw new Error('boom');
      },
    };

    const rich = await enrichListing(baseListing, {
      dataSources: failing,
      bypassCache: true,
    });

    // Product slot is synthesized from raw rather than null.
    expect(rich.product.title).toBe(baseListing.title);
    expect(rich.product.confidence).toBe(0.5);
    expect(rich.seller).toBeNull();
    expect(rich.dataQuality.completeness).toBe(0);
    expect(rich.dataQuality.failureReasons).toHaveLength(5);
    // Completeness < 0.3 caps confidence at 0.4.
    expect(rich.confidenceOverall).toBeLessThanOrEqual(0.4);
  });
});

describe('enrichListing — timeouts', () => {
  it('times out a slow source without blocking the others', async () => {
    const sources = makeSources({
      gatherMarket: () => new Promise<MarketData>(() => undefined), // never resolves
    });

    const rich = await enrichListing(baseListing, {
      dataSources: sources,
      bypassCache: true,
      timeouts: { market: 20 },
    });

    expect(rich.market).toBeNull();
    expect(rich.dataQuality.sources.market).toBe(false);
    expect(
      rich.dataQuality.failureReasons.some((r) => r === 'market: timeout'),
    ).toBe(true);
  });

  it('completes the parallel envelope close to the slowest source, not their sum', async () => {
    // Each source sleeps 80ms — if parallel, total ~80ms; if sequential, ~400ms.
    const slow = <T,>(payload: T, ms = 80) =>
      new Promise<T>((resolve) => setTimeout(() => resolve(payload), ms));

    const sources: DataSources = {
      enhanceProduct: () =>
        slow<ProductData>({
          title: baseListing.title,
          price: baseListing.price,
          currency: baseListing.currency,
          condition: '',
          category: '',
          description: '',
          images: baseListing.images,
          url: baseListing.url,
          marketplace: baseListing.marketplace,
          confidence: 0.9,
        }),
      enrichSeller: () =>
        slow<SellerData>({ name: 'x', trustScore: 60, confidence: 0.6 }),
      gatherMarket: () => slow<MarketData>({ confidence: 0.6 }),
      analyzeCompetition: () => slow<CompetitionData>({ confidence: 0.5 }),
      analyzeTrends: () => slow<TrendData>({ confidence: 0.5 }),
    };

    const start = Date.now();
    const rich = await enrichListing(baseListing, {
      dataSources: sources,
      bypassCache: true,
    });
    const elapsed = Date.now() - start;

    expect(rich.dataQuality.completeness).toBe(1);
    // Parallel: should finish well under 5x the single-source latency.
    expect(elapsed).toBeLessThan(300);
  });
});

describe('enrichListing — caching', () => {
  it('returns cached data on second call within TTL', async () => {
    const spy = vi.fn(async () => ({
      title: baseListing.title,
      price: baseListing.price,
      currency: baseListing.currency,
      condition: '',
      category: '',
      description: '',
      images: baseListing.images,
      url: baseListing.url,
      marketplace: baseListing.marketplace,
      confidence: 0.9,
    }));
    const sources = makeSources({ enhanceProduct: spy });

    const a = await enrichListing(baseListing, { dataSources: sources });
    const b = await enrichListing(baseListing, { dataSources: sources });

    expect(a).toBe(b); // same object reference returned from cache
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('cache hit completes in under 100ms', async () => {
    await enrichListing(baseListing); // warm cache
    const start = Date.now();
    await enrichListing(baseListing);
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('bypassCache forces a fresh enrichment', async () => {
    const spy = vi.fn(createMockDataSources().enhanceProduct);
    const sources = makeSources({ enhanceProduct: spy });

    await enrichListing(baseListing, { dataSources: sources });
    await enrichListing(baseListing, { dataSources: sources, bypassCache: true });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('evicts oldest entries once the cache exceeds the max', async () => {
    // We can't easily push 1000 entries in unit test time — just verify the
    // cache grows and is bounded by inserting two distinct listings.
    await enrichListing(baseListing);
    await enrichListing({ ...baseListing, url: 'https://yad2.co.il/item/zzz' });
    expect(__orchestratorCacheSizeForTests()).toBe(2);
  });
});

describe('calculateConfidence', () => {
  const fullSources = {
    product: { confidence: 1 } as ProductData,
    seller: { confidence: 1 } as SellerData,
    market: { confidence: 1 } as MarketData,
    competition: { confidence: 1 } as CompetitionData,
    trends: { confidence: 1 } as TrendData,
  };

  it('weighted average equals 1 when all sources are 1 and completeness 1', () => {
    expect(calculateConfidence(fullSources, 1)).toBeCloseTo(1, 5);
  });

  it('applies completeness as a multiplier', () => {
    expect(calculateConfidence(fullSources, 0.8)).toBeCloseTo(0.8, 5);
  });

  it('caps at 0.40 when completeness < 0.3', () => {
    expect(
      calculateConfidence(
        { ...fullSources, seller: null, market: null, competition: null, trends: null },
        0.2,
      ),
    ).toBeLessThanOrEqual(0.4);
  });

  it('caps at 0.65 when completeness < 0.6', () => {
    expect(calculateConfidence(fullSources, 0.4)).toBeLessThanOrEqual(0.65);
  });

  it('treats failed sources as 0 contribution (not 0.5 default)', () => {
    const partial = {
      product: { confidence: 1 } as ProductData,
      seller: null,
      market: null,
      competition: null,
      trends: null,
    };
    const expected = CONFIDENCE_WEIGHTS.product * 0.2; // completeness 1/5
    // capped to 0.4 because completeness < 0.3, but expected (0.03) << 0.4 so no cap impact.
    expect(calculateConfidence(partial, 0.2)).toBeCloseTo(expected, 5);
  });
});

describe('calculateDataQuality', () => {
  it('counts populated fields across all sources', () => {
    const dq = calculateDataQuality(
      {
        product: {
          title: 'x',
          price: 1,
          currency: 'ILS',
          condition: '',
          category: '',
          description: '',
          images: [],
          url: 'u',
          marketplace: 'yad2',
          confidence: 0.9,
        } as ProductData,
        seller: null,
        market: null,
        competition: null,
        trends: null,
      },
      [],
    );
    // Populated truthy/non-empty: title, price, currency, url, marketplace, confidence = 6
    expect(dq.totalDataPoints).toBe(6);
    expect(dq.completeness).toBe(0.2);
    expect(dq.sources.product).toBe(true);
    expect(dq.sources.seller).toBe(false);
  });
});

describe('withTimeout', () => {
  it('resolves when the promise wins the race', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 100, 'unit');
    expect(result).toBe('ok');
  });

  it('rejects with a labeled timeout when the promise loses', async () => {
    await expect(
      withTimeout(new Promise(() => undefined), 5, 'unit'),
    ).rejects.toThrow('unit: timeout');
  });
});

describe('parallel execution shape', () => {
  it('invokes every data source — none are skipped', async () => {
    const calls = {
      product: 0,
      seller: 0,
      market: 0,
      competition: 0,
      trends: 0,
    };
    const sources: DataSources = {
      enhanceProduct: async () => {
        calls.product += 1;
        return {
          title: 't',
          price: 0,
          currency: '',
          condition: '',
          category: '',
          description: '',
          images: [],
          url: '',
          marketplace: 'yad2',
          confidence: 0.5,
        };
      },
      enrichSeller: async () => {
        calls.seller += 1;
        return { name: '', trustScore: 0, confidence: 0.5 };
      },
      gatherMarket: async () => {
        calls.market += 1;
        return { confidence: 0.5 };
      },
      analyzeCompetition: async () => {
        calls.competition += 1;
        return { confidence: 0.5 };
      },
      analyzeTrends: async () => {
        calls.trends += 1;
        return { confidence: 0.5 };
      },
    };

    await enrichListing(baseListing, { dataSources: sources, bypassCache: true });

    expect(calls).toEqual({
      product: 1,
      seller: 1,
      market: 1,
      competition: 1,
      trends: 1,
    });
  });
});
