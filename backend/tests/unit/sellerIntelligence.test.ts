import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/database/mongoose.js', () => ({
  isMongoReady: vi.fn(() => false),
}));

vi.mock('../../src/database/models/Analysis.js', () => ({
  AnalysisModel: { find: vi.fn() },
}));

import {
  __clearSellerIntelligenceCacheForTests,
  buildReasoning,
  calculateTrustFromHistory,
  extractSellerIntelligence,
} from '../../src/features/SellerIntelligence.js';
import { AnalysisModel } from '../../src/database/models/Analysis.js';
import { isMongoReady } from '../../src/database/mongoose.js';
import type { RawListing } from '../../src/marketplace/types/RawListing.js';

const isMongoReadyMock = vi.mocked(isMongoReady);
const findMock = vi.mocked(AnalysisModel.find);

function makeQueryChain<T>(result: T) {
  return {
    sort: () => ({
      limit: () => ({
        lean: () => ({
          exec: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  } as unknown as ReturnType<typeof AnalysisModel.find>;
}

function makeListing(overrides: Partial<RawListing> = {}): RawListing {
  return {
    title: 'Test Listing',
    price: 1000,
    currency: 'ILS',
    images: [],
    url: 'https://www.facebook.com/marketplace/item/123',
    marketplace: 'facebook',
    seller: { name: 'Alice Seller' },
    ...overrides,
  };
}

beforeEach(() => {
  __clearSellerIntelligenceCacheForTests();
  isMongoReadyMock.mockReset();
  findMock.mockReset();
});

afterEach(() => {
  __clearSellerIntelligenceCacheForTests();
});

describe('calculateTrustFromHistory (pure logic)', () => {
  it('returns yellow with low confidence when history is empty', () => {
    const result = calculateTrustFromHistory([]);
    expect(result.trustScore).toBe('yellow');
    expect(result.confidence).toBeLessThanOrEqual(0.5);
    expect(result.riskFactors).toEqual([]);
  });

  it('returns green when 2+ observations have no flags and consistent currency', () => {
    const result = calculateTrustFromHistory([
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
    ]);
    expect(result.trustScore).toBe('green');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
    expect(result.riskFactors).toEqual([]);
  });

  it('returns red when seller redFlags exist in history', () => {
    const result = calculateTrustFromHistory([
      { sellerInfo: { redFlags: ['reported_for_scam'] }, redFlags: [], listing: { currency: 'ILS' } },
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
    ]);
    expect(result.trustScore).toBe('red');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
    expect(result.riskFactors).toContain('reported_for_scam');
  });

  it('caps red confidence at 0.95', () => {
    // 10 observations should not push confidence to 1.0
    const manyObs = Array.from({ length: 10 }, () => ({
      sellerInfo: { redFlags: ['scam'] },
      redFlags: [],
      listing: { currency: 'ILS' },
    }));
    const result = calculateTrustFromHistory(manyObs);
    expect(result.trustScore).toBe('red');
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  it('returns red when 2+ high_risk flags accumulate', () => {
    const result = calculateTrustFromHistory([
      { redFlags: [{ category: 'photo', severity: 'high_risk', description: 'stock photo' }] },
      { redFlags: [{ category: 'price', severity: 'high_risk', description: 'unrealistic price' }] },
    ]);
    expect(result.trustScore).toBe('red');
    expect(result.riskFactors.length).toBeGreaterThanOrEqual(2);
  });

  it('returns yellow for a single observation with no flags', () => {
    const result = calculateTrustFromHistory([
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
    ]);
    expect(result.trustScore).toBe('yellow');
    expect(result.confidence).toBeLessThanOrEqual(0.7);
  });

  it('returns yellow when currency switches across observations', () => {
    const result = calculateTrustFromHistory([
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'USD' } },
    ]);
    expect(result.trustScore).toBe('yellow');
  });
});

describe('buildReasoning', () => {
  it('produces history-based reasoning for green', () => {
    const text = buildReasoning('green', 3, []);
    expect(text).toMatch(/3 prior listing/);
    expect(text).toMatch(/trustworthy|consistent/i);
  });

  it('produces history-based reasoning for red with risk factors', () => {
    const text = buildReasoning('red', 2, ['scam_reports', 'price_inconsistency']);
    expect(text).toMatch(/scam_reports/);
    expect(text).toMatch(/risk/i);
  });

  it('produces yellow reasoning for insufficient history', () => {
    const text = buildReasoning('yellow', 1, []);
    expect(text).toMatch(/1 prior listing/);
    expect(text).toMatch(/insufficient/i);
  });
});

describe('extractSellerIntelligence — integration with mocked Mongo', () => {
  it('returns yellow with "Unknown" name when seller info is missing', async () => {
    isMongoReadyMock.mockReturnValue(false);
    const result = await extractSellerIntelligence(makeListing({ seller: undefined }));
    expect(result.name).toBe('Unknown');
    expect(result.trustScore).toBe('yellow');
    expect(result.sources.fromHistory).toBe(false);
    expect(result.sources.fromScrape).toBe(false);
  });

  it('returns yellow when seller name is blank string', async () => {
    isMongoReadyMock.mockReturnValue(false);
    const result = await extractSellerIntelligence(makeListing({ seller: { name: '   ' } }));
    expect(result.name).toBe('Unknown');
    expect(result.trustScore).toBe('yellow');
  });

  it('returns yellow when Mongo is offline', async () => {
    isMongoReadyMock.mockReturnValue(false);
    const result = await extractSellerIntelligence(makeListing({ seller: { name: 'Bob' } }));
    expect(result.trustScore).toBe('yellow');
    expect(result.historyCount).toBe(0);
    expect(result.sources.fromHistory).toBe(false);
  });

  it('returns green when Mongo history shows consistent trusted seller', async () => {
    isMongoReadyMock.mockReturnValue(true);
    findMock.mockReturnValue(makeQueryChain([
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
    ]));
    const result = await extractSellerIntelligence(makeListing({ seller: { name: 'Charlie Trusted' } }));
    expect(result.trustScore).toBe('green');
    expect(result.historyCount).toBe(3);
    expect(result.sources.fromHistory).toBe(true);
  });

  it('returns red when Mongo history contains seller red flags', async () => {
    isMongoReadyMock.mockReturnValue(true);
    findMock.mockReturnValue(makeQueryChain([
      { sellerInfo: { redFlags: ['reported_for_scam'] }, redFlags: [], listing: { currency: 'ILS' } },
    ]));
    const result = await extractSellerIntelligence(makeListing({ seller: { name: 'Eve Scammer' } }));
    expect(result.trustScore).toBe('red');
    expect(result.riskFactors).toContain('reported_for_scam');
  });

  it('caches results — second call for same seller does not re-query Mongo', async () => {
    isMongoReadyMock.mockReturnValue(true);
    findMock.mockReturnValue(makeQueryChain([
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
    ]));
    const listing = makeListing({ seller: { name: 'Cached Carol' } });
    const first = await extractSellerIntelligence(listing);
    expect(findMock).toHaveBeenCalledTimes(1);
    const second = await extractSellerIntelligence(listing);
    expect(findMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('does NOT share cache between same seller name on different marketplaces', async () => {
    isMongoReadyMock.mockReturnValue(true);
    // Facebook: green seller
    findMock.mockReturnValueOnce(makeQueryChain([
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
    ]));
    // Yad2: red seller (same name)
    findMock.mockReturnValueOnce(makeQueryChain([
      { sellerInfo: { redFlags: ['fraud'] }, redFlags: [], listing: { currency: 'ILS' } },
    ]));

    const fbResult = await extractSellerIntelligence(
      makeListing({ marketplace: 'facebook', seller: { name: 'John Smith' } }),
    );
    const yad2Result = await extractSellerIntelligence(
      makeListing({ marketplace: 'yad2', seller: { name: 'John Smith' }, url: 'https://www.yad2.co.il/item/1' }),
    );

    expect(fbResult.trustScore).toBe('green');
    expect(yad2Result.trustScore).toBe('red');
    expect(findMock).toHaveBeenCalledTimes(2); // separate DB queries, no collision
  });

  it('never calls fetch (no profile scraping from backend)', async () => {
    isMongoReadyMock.mockReturnValue(true);
    findMock.mockReturnValue(makeQueryChain([]));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await extractSellerIntelligence(makeListing({
      seller: { name: 'Any Seller', profileUrl: 'https://www.facebook.com/profile.php?id=999' },
    }));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('does not throw and returns yellow when Mongo query fails', async () => {
    isMongoReadyMock.mockReturnValue(true);
    findMock.mockImplementation(() => { throw new Error('mongo exploded'); });
    const result = await extractSellerIntelligence(makeListing({ seller: { name: 'Unlucky Dan' } }));
    expect(result.trustScore).toBe('yellow');
    expect(result.historyCount).toBe(0);
  });

  it('performance: 100 repeat lookups complete in <500ms (cache served)', async () => {
    isMongoReadyMock.mockReturnValue(true);
    findMock.mockReturnValue(makeQueryChain([
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
    ]));
    const listing = makeListing({ seller: { name: 'Hot Cache Henry' } });
    await extractSellerIntelligence(listing);
    const start = Date.now();
    for (let i = 0; i < 100; i += 1) await extractSellerIntelligence(listing);
    expect(Date.now() - start).toBeLessThan(500);
    expect(findMock).toHaveBeenCalledTimes(1);
  });
});
