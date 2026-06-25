import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { MarketplaceObserver } from '../../src/marketplace/MarketplaceObserver.js';
import type { ObservedListing } from '../../src/marketplace/types.js';

// -----------------------------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------------------------

function makeListing(overrides: Partial<ObservedListing> = {}): ObservedListing {
  return {
    marketplace: 'facebook',
    listingId: '1',
    listingUrl: 'https://www.facebook.com/marketplace/item/1/',
    title: 'PS5 Console',
    price: 1700,
    currency: 'ILS',
    searchQuery: 'ps5',
    observedAt: new Date('2026-06-23T00:00:00Z'),
    ...overrides,
  };
}

function makeListings(count: number): ObservedListing[] {
  return Array.from({ length: count }, (_, i) =>
    makeListing({
      listingId: String(i + 1),
      listingUrl: `https://www.facebook.com/marketplace/item/${i + 1}/`,
    }),
  );
}

function okResponse(body: unknown = { success: true, processed: 0 }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// -----------------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------------

describe('MarketplaceObserver', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: MockInstance;
  let warnSpy: MockInstance;
  let errorSpy: MockInstance;
  let observer: MarketplaceObserver;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue(okResponse({ success: true, processed: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    // Silence noisy logs but allow assertions when needed.
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    observer = new MarketplaceObserver('http://localhost:4000');
  });

  afterEach(() => {
    // The observer schedules a setInterval for SPA detection; clearing all
    // timers prevents leakage between tests.
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Deduplication (3 tests)
  // ---------------------------------------------------------------------------

  describe('deduplication', () => {
    it('prevents adding the same listing twice', () => {
      const listing = makeListing({ listingId: '123' });

      observer.addObservations([listing]);
      observer.addObservations([listing]);

      const stats = observer.getStats();
      expect(stats.observedCount).toBe(1);
      expect(stats.batchSize).toBe(1);
    });

    it('filters a mix of duplicates and new listings', () => {
      const listing1 = makeListing({ listingId: '1' });
      const listing2 = makeListing({ listingId: '2' });

      observer.addObservations([listing1]);
      observer.addObservations([listing1, listing2]);

      const stats = observer.getStats();
      expect(stats.observedCount).toBe(2);
      expect(stats.batchSize).toBe(2);
    });

    it('handles empty input gracefully', () => {
      observer.addObservations([]);
      const stats = observer.getStats();
      expect(stats.batchSize).toBe(0);
      expect(stats.observedCount).toBe(0);
    });

    it('treats non-array input as a no-op', () => {
      // Defensive: the public contract only declares ObservedListing[], but
      // a misbehaving caller shouldn't blow us up.
      observer.addObservations(null as unknown as ObservedListing[]);
      observer.addObservations(undefined as unknown as ObservedListing[]);
      expect(observer.getStats()).toEqual({ observedCount: 0, batchSize: 0 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('filters duplicates within a single call', () => {
      const listing = makeListing({ listingId: '5' });
      // Same listing repeated 3 times in one call.
      observer.addObservations([listing, listing, listing]);

      const stats = observer.getStats();
      expect(stats.observedCount).toBe(1);
      expect(stats.batchSize).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Batching (3 tests)
  // ---------------------------------------------------------------------------

  describe('batching', () => {
    it('accumulates observations below the batch size without flushing', () => {
      const listings = makeListings(15);
      observer.addObservations(listings);

      const stats = observer.getStats();
      expect(stats.batchSize).toBe(15);
      expect(stats.observedCount).toBe(15);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('flushes immediately when batch reaches 20', () => {
      const listings = makeListings(20);
      observer.addObservations(listings);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:4000/marketplace/observe');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string);
      expect(body.observations).toHaveLength(20);
      expect(typeof body.timestamp).toBe('string');

      // Batch is drained.
      expect(observer.getStats().batchSize).toBe(0);
      // observedListings Set persists (still dedupes future calls).
      expect(observer.getStats().observedCount).toBe(20);
    });

    it('splits a 25-item add into one immediate flush (20) and one pending (5)', () => {
      const listings = makeListings(25);
      observer.addObservations(listings);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.observations).toHaveLength(20);

      // The remaining 5 should sit in the batch waiting for the timer.
      expect(observer.getStats().batchSize).toBe(5);
      expect(observer.getStats().observedCount).toBe(25);
    });
  });

  // ---------------------------------------------------------------------------
  // Timer management (2 tests)
  // ---------------------------------------------------------------------------

  describe('timer management', () => {
    it('flushes automatically after 30 seconds when batch is not full', async () => {
      observer.addObservations(makeListings(5));
      expect(fetchMock).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(30_000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.observations).toHaveLength(5);
      expect(observer.getStats().batchSize).toBe(0);
    });

    it('cancels the timer when the batch fills before the timeout', async () => {
      // Start with a partial batch so a timer is set.
      observer.addObservations(makeListings(5));
      expect(fetchMock).not.toHaveBeenCalled();

      // Top up to 20 → immediate flush, timer should be cancelled.
      const more = Array.from({ length: 15 }, (_, i) =>
        makeListing({
          listingId: String(100 + i),
          listingUrl: `https://www.facebook.com/marketplace/item/${100 + i}/`,
        }),
      );
      observer.addObservations(more);

      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Advance well past the original 30s timeout - if timer leaked we'd
      // get a second flush of an empty batch (no fetch) but the safer check
      // is to confirm fetch count didn't increase.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not start a second timer if one is already running', async () => {
      observer.addObservations(makeListings(3));
      // Advance partway so the original timer is still pending.
      await vi.advanceTimersByTimeAsync(10_000);

      observer.addObservations(
        Array.from({ length: 3 }, (_, i) =>
          makeListing({
            listingId: String(50 + i),
            listingUrl: `https://www.facebook.com/marketplace/item/${50 + i}/`,
          }),
        ),
      );

      // Advance the remaining 20s of the original timer (10s already elapsed).
      await vi.advanceTimersByTimeAsync(20_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Ensure we don't double-fire.
      await vi.advanceTimersByTimeAsync(30_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Session management (2 tests)
  // ---------------------------------------------------------------------------

  describe('session management', () => {
    it('clearObservedListings empties the Set but leaves the batch alone', () => {
      observer.addObservations(makeListings(3));
      expect(observer.getStats()).toEqual({ observedCount: 3, batchSize: 3 });

      observer.clearObservedListings();

      const stats = observer.getStats();
      expect(stats.observedCount).toBe(0);
      // Batch is intentionally untouched — flushBatch is the right tool for
      // emptying the batch.
      expect(stats.batchSize).toBe(3);
    });

    it('getStats reports the live observed count and batch size', () => {
      expect(observer.getStats()).toEqual({ observedCount: 0, batchSize: 0 });

      observer.addObservations([makeListing({ listingId: '1' })]);
      expect(observer.getStats()).toEqual({ observedCount: 1, batchSize: 1 });

      observer.addObservations([makeListing({ listingId: '2' })]);
      expect(observer.getStats()).toEqual({ observedCount: 2, batchSize: 2 });

      // Duplicates do not move the counter.
      observer.addObservations([makeListing({ listingId: '1' })]);
      expect(observer.getStats()).toEqual({ observedCount: 2, batchSize: 2 });
    });

    it('flushBatch on an empty batch is a no-op', async () => {
      await observer.flushBatch();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling (2 tests)
  // ---------------------------------------------------------------------------

  describe('error handling', () => {
    it('logs but does not throw when fetch rejects (network error)', async () => {
      fetchMock.mockReset();
      fetchMock.mockRejectedValueOnce(new Error('network down'));

      observer.addObservations(makeListings(20));

      // The flush is fire-and-forget from addObservations; wait for the
      // microtask queue to settle.
      await vi.waitFor(() => {
        expect(errorSpy).toHaveBeenCalled();
      });

      // Batch was drained — we do NOT auto-retry per spec; Task 7 will add
      // retry/queue semantics.
      expect(observer.getStats().batchSize).toBe(0);
    });

    it('logs but does not throw when server returns 5xx', async () => {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(
        new Response('upstream exploded', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );

      observer.addObservations(makeListings(20));

      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalled();
      });

      expect(observer.getStats().batchSize).toBe(0);
    });
  });
});
