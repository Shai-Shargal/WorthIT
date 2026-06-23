import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

import type { ObservedListing } from '../../src/marketplace/types.js';

// -----------------------------------------------------------------------------
// Module mocks
//
// We need to control:
//   - searchDetection.isMarketplaceSearchPage  (page-type routing)
//   - listingExtractor.extractListingsFromSearchPage  (what cards we "see")
//   - MarketplaceObserver  (so we can assert addObservations was called and
//     so its setInterval doesn't leak between tests)
//   - extractor.extractActiveListing  (item-detail page path)
//   - services/api.getApiBase  (so fetch URLs are deterministic)
//
// The mocked module factories live above any import so vitest hoists them
// before passive-collect.ts is loaded.
// -----------------------------------------------------------------------------

vi.mock('../../src/marketplace/searchDetection.js', () => ({
  isMarketplaceSearchPage: vi.fn(() => false),
  detectMarketplaceType: vi.fn(() => null),
  getSearchQuery: vi.fn(() => null),
}));

vi.mock('../../src/marketplace/listingExtractor.js', () => ({
  extractListingsFromSearchPage: vi.fn(() => []),
}));

const addObservationsMock = vi.fn();
const flushBatchMock = vi.fn(async () => undefined);
const clearObservedListingsMock = vi.fn();
const observerCtorMock = vi.fn();

vi.mock('../../src/marketplace/MarketplaceObserver.js', () => {
  class FakeMarketplaceObserver {
    addObservations = addObservationsMock;
    flushBatch = flushBatchMock;
    clearObservedListings = clearObservedListingsMock;
    getStats = () => ({ observedCount: 0, batchSize: 0 });
    constructor() {
      observerCtorMock();
    }
  }
  return { MarketplaceObserver: FakeMarketplaceObserver };
});

vi.mock('../../src/content/extractor.js', () => ({
  extractFromAnchor: vi.fn(() => null),
  extractActiveListing: vi.fn(() => null),
  fallbackCurrencyFromPage: vi.fn(() => 'ILS'),
}));

vi.mock('../../src/services/api.js', () => ({
  getApiBase: vi.fn(async () => 'http://localhost:8000'),
}));

// Skip the module-level auto-init so each test drives initPassiveCollect()
// explicitly. Must be set BEFORE the dynamic import below.
(globalThis as { __WORTHIT_SKIP_AUTOINIT__?: boolean }).__WORTHIT_SKIP_AUTOINIT__ = true;

// Use a dynamic import so vi.mock above is fully wired before the SUT loads.
const {
  detectPageType,
  startSearchPageCollection,
  collectSearchListings,
  silentlySaveItemListing,
  startPassiveCollection,
  initPassiveCollect,
  __resetSearchCollectionForTests,
  __getSearchObserverForTests,
} = await import('../../src/content/passive-collect.js');

const searchDetection = await import('../../src/marketplace/searchDetection.js');
const listingExtractor = await import('../../src/marketplace/listingExtractor.js');
const extractor = await import('../../src/content/extractor.js');

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function setLocation(href: string): void {
  // jsdom won't let us re-assign window.location, but pushState rewrites it.
  window.history.replaceState({}, '', href);
}

function makeListing(overrides: Partial<ObservedListing> = {}): ObservedListing {
  return {
    marketplace: 'facebook',
    listingId: '1',
    listingUrl: '/marketplace/item/1/',
    title: 'PS5 Console',
    price: 1700,
    currency: 'ILS',
    searchQuery: 'ps5',
    observedAt: new Date('2026-06-23T00:00:00Z'),
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------------

describe('passive-collect integration', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    // Silence noisy logs from MarketplaceObserver / passive-collect.
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Reset all mocks between tests.
    addObservationsMock.mockReset();
    flushBatchMock.mockReset();
    clearObservedListingsMock.mockReset();
    observerCtorMock.mockReset();
    (searchDetection.isMarketplaceSearchPage as Mock).mockReset().mockReturnValue(false);
    (listingExtractor.extractListingsFromSearchPage as Mock).mockReset().mockReturnValue([]);
    (extractor.extractActiveListing as Mock).mockReset().mockReturnValue(null);

    // Reset URL to a non-marketplace path so detectPageType is deterministic.
    setLocation('https://www.facebook.com/');
    __resetSearchCollectionForTests();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    __resetSearchCollectionForTests();
  });

  // ---------------------------------------------------------------------------
  // detectPageType
  // ---------------------------------------------------------------------------

  describe('detectPageType', () => {
    it('detects item detail pages from the pathname', () => {
      setLocation('https://www.facebook.com/marketplace/item/123456789/');
      expect(detectPageType()).toBe('item_detail');
    });

    it('detects search pages via isMarketplaceSearchPage', () => {
      setLocation('https://www.facebook.com/marketplace/tlv/search?query=ps5');
      (searchDetection.isMarketplaceSearchPage as Mock).mockReturnValue(true);
      expect(detectPageType()).toBe('search');
    });

    it('falls back to browse for everything else', () => {
      setLocation('https://www.facebook.com/marketplace/category/electronics/');
      (searchDetection.isMarketplaceSearchPage as Mock).mockReturnValue(false);
      expect(detectPageType()).toBe('browse');
    });
  });

  // ---------------------------------------------------------------------------
  // initPassiveCollect — routes to the right handler
  // ---------------------------------------------------------------------------

  describe('initPassiveCollect routing', () => {
    it('on a search page, constructs a MarketplaceObserver and adds extracted listings', () => {
      setLocation('https://www.facebook.com/marketplace/tlv/search?query=ps5');
      (searchDetection.isMarketplaceSearchPage as Mock).mockReturnValue(true);
      const listings = [makeListing({ listingId: '1' }), makeListing({ listingId: '2' })];
      (listingExtractor.extractListingsFromSearchPage as Mock).mockReturnValue(listings);

      const result = initPassiveCollect();

      expect(result).toBe('search');
      expect(observerCtorMock).toHaveBeenCalledTimes(1);
      expect(addObservationsMock).toHaveBeenCalledTimes(1);
      expect(addObservationsMock).toHaveBeenCalledWith(listings);
      expect(__getSearchObserverForTests()).not.toBeNull();
    });

    it('on a browse page, falls back to the legacy logic and does not create an observer', () => {
      setLocation('https://www.facebook.com/marketplace/category/electronics/');
      (searchDetection.isMarketplaceSearchPage as Mock).mockReturnValue(false);

      const result = initPassiveCollect();

      expect(result).toBe('browse');
      expect(observerCtorMock).not.toHaveBeenCalled();
      expect(addObservationsMock).not.toHaveBeenCalled();
      // Legacy collectVisible() reads currency from the page.
      expect(extractor.fallbackCurrencyFromPage).toHaveBeenCalled();
    });

    it('on an item-detail page, kicks off silentlySaveItemListing without using the observer', async () => {
      setLocation('https://www.facebook.com/marketplace/item/777/');

      const result = initPassiveCollect();

      // Advance past the 2s render-wait inside silentlySaveItemListing.
      await vi.advanceTimersByTimeAsync(2_500);

      expect(result).toBe('item_detail');
      expect(observerCtorMock).not.toHaveBeenCalled();
      expect(addObservationsMock).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Search-page event handling (scroll + mutation)
  // ---------------------------------------------------------------------------

  describe('search-page event handling', () => {
    beforeEach(() => {
      setLocation('https://www.facebook.com/marketplace/tlv/search?query=ps5');
      (searchDetection.isMarketplaceSearchPage as Mock).mockReturnValue(true);
    });

    it('re-collects ~1s after a scroll event', () => {
      (listingExtractor.extractListingsFromSearchPage as Mock).mockReturnValue([]);
      startSearchPageCollection();
      // One call from the initial drain.
      expect(listingExtractor.extractListingsFromSearchPage).toHaveBeenCalledTimes(1);

      // Now simulate a fresh card appearing, then a scroll.
      (listingExtractor.extractListingsFromSearchPage as Mock).mockReturnValue([
        makeListing({ listingId: 'new-1' }),
      ]);
      window.dispatchEvent(new Event('scroll'));

      // Before the debounce window elapses, no new call.
      vi.advanceTimersByTime(500);
      expect(listingExtractor.extractListingsFromSearchPage).toHaveBeenCalledTimes(1);

      // After 1s total, the debounced re-collect fires.
      vi.advanceTimersByTime(600);
      expect(listingExtractor.extractListingsFromSearchPage).toHaveBeenCalledTimes(2);
      expect(addObservationsMock).toHaveBeenCalledTimes(1);
      expect(addObservationsMock).toHaveBeenCalledWith([
        expect.objectContaining({ listingId: 'new-1' }),
      ]);
    });

    it('re-collects when the DOM mutates (cards injected by Facebook)', async () => {
      (listingExtractor.extractListingsFromSearchPage as Mock).mockReturnValue([]);
      startSearchPageCollection();
      expect(listingExtractor.extractListingsFromSearchPage).toHaveBeenCalledTimes(1);

      // Stage a card and trigger a mutation by appending to body.
      (listingExtractor.extractListingsFromSearchPage as Mock).mockReturnValue([
        makeListing({ listingId: 'mut-1' }),
      ]);
      const div = document.createElement('div');
      document.body.appendChild(div);

      // MutationObserver fires asynchronously — let microtasks drain.
      await Promise.resolve();
      await Promise.resolve();

      expect(listingExtractor.extractListingsFromSearchPage).toHaveBeenCalledTimes(2);
      expect(addObservationsMock).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // collectSearchListings — error / empty handling
  // ---------------------------------------------------------------------------

  describe('collectSearchListings', () => {
    beforeEach(() => {
      setLocation('https://www.facebook.com/marketplace/tlv/search?query=ps5');
      (searchDetection.isMarketplaceSearchPage as Mock).mockReturnValue(true);
    });

    it('is a no-op when the observer has not been initialised', () => {
      // No startSearchPageCollection call — observer is null.
      collectSearchListings();
      expect(listingExtractor.extractListingsFromSearchPage).not.toHaveBeenCalled();
      expect(addObservationsMock).not.toHaveBeenCalled();
    });

    it('does not call addObservations when extraction returns an empty array', () => {
      (listingExtractor.extractListingsFromSearchPage as Mock).mockReturnValue([]);
      startSearchPageCollection();
      // Initial drain ran but returned [], so addObservations stays untouched.
      expect(listingExtractor.extractListingsFromSearchPage).toHaveBeenCalledTimes(1);
      expect(addObservationsMock).not.toHaveBeenCalled();
    });

    it('swallows extraction errors without crashing the observer', () => {
      // Initial drain returns [] so startSearchPageCollection itself doesn't blow up.
      (listingExtractor.extractListingsFromSearchPage as Mock).mockReturnValue([]);
      startSearchPageCollection();

      // Subsequent call throws — collectSearchListings must log and recover.
      (listingExtractor.extractListingsFromSearchPage as Mock).mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => collectSearchListings()).not.toThrow();
      expect(addObservationsMock).not.toHaveBeenCalled();
    });

    it('swallows observer errors without crashing the page', () => {
      (listingExtractor.extractListingsFromSearchPage as Mock).mockReturnValue([
        makeListing({ listingId: 'err-1' }),
      ]);
      addObservationsMock.mockImplementation(() => {
        throw new Error('observer kaboom');
      });

      expect(() => startSearchPageCollection()).not.toThrow();
      expect(addObservationsMock).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Item-detail page saving (must keep working through the integration)
  // ---------------------------------------------------------------------------

  describe('silentlySaveItemListing', () => {
    it('posts a single observation to /marketplace/observe when extraction succeeds', async () => {
      setLocation('https://www.facebook.com/marketplace/item/42/');
      (extractor.extractActiveListing as Mock).mockReturnValue({
        title: 'PS5',
        price: 1700,
        currency: 'ILS',
        url: 'https://www.facebook.com/marketplace/item/42/',
      });

      const promise = silentlySaveItemListing();
      await vi.advanceTimersByTimeAsync(2_500);
      await promise;

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8000/marketplace/observe');
      const body = JSON.parse((init as { body: string }).body);
      expect(body).toEqual({
        observations: [
          {
            name: 'PS5',
            price: 1700,
            currency: 'ILS',
            description: undefined,
            url: 'https://www.facebook.com/marketplace/item/42/',
          },
        ],
      });
    });

    it('returns early without posting when extraction yields nothing', async () => {
      setLocation('https://www.facebook.com/marketplace/item/42/');
      (extractor.extractActiveListing as Mock).mockReturnValue(null);

      const promise = silentlySaveItemListing();
      await vi.advanceTimersByTimeAsync(2_500);
      await promise;

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Browse fallback (we still keep the legacy path alive)
  // ---------------------------------------------------------------------------

  describe('startPassiveCollection (legacy browse fallback)', () => {
    it('runs without error on an empty page and never calls the new observer', () => {
      setLocation('https://www.facebook.com/marketplace/category/electronics/');
      expect(() => startPassiveCollection()).not.toThrow();
      expect(observerCtorMock).not.toHaveBeenCalled();
      expect(addObservationsMock).not.toHaveBeenCalled();
    });
  });
});
