import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the mongoose readiness check so the unit tests are pure (no Mongo).
vi.mock('../../src/database/mongoose.js', () => ({
  isMongoReady: vi.fn(() => false),
}));

// Mock the AnalysisModel so we can stub out the query chain.
vi.mock('../../src/database/models/Analysis.js', () => {
  return {
    AnalysisModel: {
      find: vi.fn(),
    },
  };
});

import {
  __clearSellerIntelligenceCacheForTests,
  buildReasoning,
  calculateTrustFromHistory,
  calculateTrustFromProfile,
  extractSellerIntelligence,
  parseFacebookProfileHtml,
} from '../../src/features/SellerIntelligence.js';
import { AnalysisModel } from '../../src/database/models/Analysis.js';
import { isMongoReady } from '../../src/database/mongoose.js';
import type { RawListing } from '../../src/marketplace/types/RawListing.js';

const isMongoReadyMock = vi.mocked(isMongoReady);
const findMock = vi.mocked(AnalysisModel.find);

function makeQueryChain<T>(result: T) {
  // Mimic .sort().limit().lean().exec() chain.
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
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.riskFactors).toEqual([]);
  });

  it('returns red when seller redFlags exist in history', () => {
    const result = calculateTrustFromHistory([
      {
        sellerInfo: { redFlags: ['reported_for_scam'] },
        redFlags: [],
        listing: { currency: 'ILS' },
      },
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
    ]);
    expect(result.trustScore).toBe('red');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.riskFactors).toContain('reported_for_scam');
  });

  it('returns red when 2+ high_risk flags accumulate', () => {
    const result = calculateTrustFromHistory([
      {
        redFlags: [
          { category: 'photo', severity: 'high_risk', description: 'stock photo' },
        ],
      },
      {
        redFlags: [
          { category: 'price', severity: 'high_risk', description: 'unrealistic price' },
        ],
      },
    ]);
    expect(result.trustScore).toBe('red');
    expect(result.riskFactors.length).toBeGreaterThanOrEqual(2);
  });

  it('returns yellow for a single observation with no flags (insufficient evidence)', () => {
    const result = calculateTrustFromHistory([
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
    ]);
    expect(result.trustScore).toBe('yellow');
    expect(result.confidence).toBeLessThanOrEqual(0.7);
  });

  it('returns yellow when currency switches across observations (mixed signal)', () => {
    const result = calculateTrustFromHistory([
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
      { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'USD' } },
    ]);
    expect(result.trustScore).toBe('yellow');
  });
});

describe('calculateTrustFromProfile (pure logic)', () => {
  it('returns yellow when profile does not exist', () => {
    const result = calculateTrustFromProfile({
      completeness: 0,
      exists: false,
      signals: [],
    });
    expect(result.trustScore).toBe('yellow');
    expect(result.confidence).toBeLessThanOrEqual(0.4);
  });

  it('returns green only when profile is highly complete', () => {
    const result = calculateTrustFromProfile({
      completeness: 0.9,
      exists: true,
      signals: ['has_og_title', 'has_profile_image', 'has_description', 'has_marketplace_activity'],
    });
    expect(result.trustScore).toBe('green');
  });

  it('returns yellow for partially complete profiles', () => {
    const result = calculateTrustFromProfile({
      completeness: 0.5,
      exists: true,
      signals: ['has_og_title', 'has_description'],
    });
    expect(result.trustScore).toBe('yellow');
  });
});

describe('parseFacebookProfileHtml', () => {
  it('returns exists=false when HTML has no profile markers', () => {
    const result = parseFacebookProfileHtml('<html><body>login required</body></html>');
    expect(result.exists).toBe(false);
    expect(result.completeness).toBe(0);
  });

  it('detects og:title, og:image, og:description markers', () => {
    const html = `
      <meta property="og:title" content="Alice" />
      <meta property="og:image" content="https://x/y.jpg" />
      <meta property="og:description" content="Profile" />
    `;
    const result = parseFacebookProfileHtml(html);
    expect(result.exists).toBe(true);
    expect(result.signals).toContain('has_og_title');
    expect(result.signals).toContain('has_profile_image');
    expect(result.signals).toContain('has_description');
  });
});

describe('buildReasoning', () => {
  it('produces history-based reasoning for green', () => {
    const text = buildReasoning('green', 'history', { historyCount: 3 });
    expect(text).toMatch(/3 prior listing/);
    expect(text).toMatch(/trustworthy|consistent/i);
  });

  it('produces history-based reasoning for red with risk factors', () => {
    const text = buildReasoning('red', 'history', {
      historyCount: 2,
      riskFactors: ['scam_reports', 'price_inconsistency'],
    });
    expect(text).toMatch(/scam_reports/);
    expect(text).toMatch(/risk/i);
  });

  it('produces profile-based reasoning', () => {
    const text = buildReasoning('green', 'profile', { completeness: 0.9 });
    expect(text).toMatch(/profile/i);
    expect(text).toMatch(/90/);
  });
});

describe('extractSellerIntelligence — integration with mocked Mongo', () => {
  it('returns yellow with "Unknown" name when seller info is missing', async () => {
    isMongoReadyMock.mockReturnValue(false);
    const result = await extractSellerIntelligence(
      makeListing({ seller: undefined }),
    );
    expect(result.name).toBe('Unknown');
    expect(result.trustScore).toBe('yellow');
    expect(result.sources.fromHistory).toBe(false);
    expect(result.sources.fromScrape).toBe(false);
  });

  it('returns yellow when seller name is blank string', async () => {
    isMongoReadyMock.mockReturnValue(false);
    const result = await extractSellerIntelligence(
      makeListing({ seller: { name: '   ' } }),
    );
    expect(result.name).toBe('Unknown');
    expect(result.trustScore).toBe('yellow');
  });

  it('returns yellow when Mongo is offline and no profile URL available', async () => {
    isMongoReadyMock.mockReturnValue(false);
    const result = await extractSellerIntelligence(
      makeListing({ seller: { name: 'Bob' } }),
    );
    expect(result.trustScore).toBe('yellow');
    expect(result.historyCount).toBe(0);
    expect(result.sources.fromHistory).toBe(false);
  });

  it('returns green when Mongo history shows consistent trusted seller', async () => {
    isMongoReadyMock.mockReturnValue(true);
    findMock.mockReturnValue(
      makeQueryChain([
        { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
        { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
        { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
      ]),
    );
    const result = await extractSellerIntelligence(
      makeListing({ seller: { name: 'Charlie Trusted' } }),
    );
    expect(result.trustScore).toBe('green');
    expect(result.historyCount).toBe(3);
    expect(result.sources.fromHistory).toBe(true);
  });

  it('returns red when Mongo history contains seller red flags', async () => {
    isMongoReadyMock.mockReturnValue(true);
    findMock.mockReturnValue(
      makeQueryChain([
        {
          sellerInfo: { redFlags: ['reported_for_scam'] },
          redFlags: [],
          listing: { currency: 'ILS' },
        },
      ]),
    );
    const result = await extractSellerIntelligence(
      makeListing({ seller: { name: 'Eve Scammer' } }),
    );
    expect(result.trustScore).toBe('red');
    expect(result.riskFactors).toContain('reported_for_scam');
  });

  it('caches results — second call for same seller does not re-query Mongo', async () => {
    isMongoReadyMock.mockReturnValue(true);
    findMock.mockReturnValue(
      makeQueryChain([
        { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
        { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
      ]),
    );

    const listing = makeListing({ seller: { name: 'Cached Carol' } });
    const first = await extractSellerIntelligence(listing);
    expect(findMock).toHaveBeenCalledTimes(1);

    const second = await extractSellerIntelligence(listing);
    expect(findMock).toHaveBeenCalledTimes(1); // still 1 — served from cache
    expect(second).toEqual(first);
  });

  it('does not throw and returns yellow when Mongo query fails', async () => {
    isMongoReadyMock.mockReturnValue(true);
    findMock.mockImplementation(() => {
      throw new Error('mongo exploded');
    });

    const result = await extractSellerIntelligence(
      makeListing({ seller: { name: 'Unlucky Dan' } }),
    );
    expect(result.trustScore).toBe('yellow');
    expect(result.historyCount).toBe(0);
  });

  it('does not scrape Facebook profile for Yad2 listings', async () => {
    isMongoReadyMock.mockReturnValue(true);
    findMock.mockReturnValue(makeQueryChain([]));

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await extractSellerIntelligence(
      makeListing({
        marketplace: 'yad2',
        url: 'https://www.yad2.co.il/item/123',
        seller: {
          name: 'Yad2 Seller',
          // Even if some profileUrl-like value is provided, must not scrape FB.
          profileUrl: 'https://www.facebook.com/profile.php?id=999',
        },
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.trustScore).toBe('yellow');
    fetchSpy.mockRestore();
  });

  it('performance: 100 repeat lookups complete in <500ms (cache served)', async () => {
    isMongoReadyMock.mockReturnValue(true);
    findMock.mockReturnValue(
      makeQueryChain([
        { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
        { sellerInfo: { redFlags: [] }, redFlags: [], listing: { currency: 'ILS' } },
      ]),
    );

    const listing = makeListing({ seller: { name: 'Hot Cache Henry' } });
    await extractSellerIntelligence(listing); // prime cache

    const start = Date.now();
    for (let i = 0; i < 100; i += 1) {
      await extractSellerIntelligence(listing);
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(findMock).toHaveBeenCalledTimes(1); // still 1 hit — all from cache
  });
});
