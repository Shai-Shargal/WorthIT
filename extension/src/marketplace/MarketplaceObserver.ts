/**
 * MarketplaceObserver — client-side dedup + batched shipping.
 *
 * Responsibilities (Passive Collection Task 2):
 *   1. Keep an in-memory Set of `listingId`s seen during the current session
 *      so we never POST the same observation twice.
 *   2. Accumulate `ObservedListing`s in a batch and ship them to
 *      `POST /marketplace/observe` either when the batch reaches
 *      `BATCH_SIZE` items or when `BATCH_TIMEOUT_MS` elapses — whichever
 *      comes first.
 *   3. Survive network failures gracefully: log, drop the batch (Task 7 will
 *      introduce retry/persistence), do NOT throw and never crash the host
 *      page.
 *   4. Reset session state on page unload and on SPA-style URL changes so a
 *      fresh search starts with a clean slate.
 *
 * Note: this class is intended to be instantiated exactly once per content
 * script, which is why it freely wires global `window` listeners and a
 * polling `setInterval`. It is safe to instantiate in jsdom for tests.
 */
import type { ObservedListing } from './types.js';

/** Payload shape sent to `POST /marketplace/observe`. */
interface ObservePayload {
  observations: ObservedListing[];
  timestamp: string;
}

/** Minimal expected response shape — only `processed` is logged. */
interface ObserveResponse {
  success?: boolean;
  processed?: number;
}

export interface MarketplaceObserverStats {
  observedCount: number;
  batchSize: number;
}

export class MarketplaceObserver {
  /** Listing IDs we've already added to a batch this session. */
  private observedListings: Set<string> = new Set();
  /** Pending observations awaiting flush. */
  private batch: ObservedListing[] = [];
  /** Active flush-timeout handle, if any. */
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  /** Handle for the SPA-navigation polling interval. */
  private navigationTimer: ReturnType<typeof setInterval> | null = null;

  /** Maximum items per batch before we flush eagerly. */
  private readonly BATCH_SIZE = 20;
  /** Fallback flush cadence when batches don't fill on their own. */
  private readonly BATCH_TIMEOUT_MS = 30_000;
  /** Polling cadence for SPA navigation detection. */
  private readonly NAV_POLL_MS = 500;
  /** Absolute backend URL, resolved from chrome.storage at instantiation time. */
  private readonly ENDPOINT: string;

  constructor(apiBase: string) {
    this.ENDPOINT = `${apiBase.replace(/\/$/, '')}/marketplace/observe`;
    this.setupListeners();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Wire up unload + SPA navigation listeners. Called automatically from the
   * constructor. Guarded so we don't blow up in environments without a real
   * `window` (e.g. some Node test runners — vitest's jsdom is fine).
   */
  private setupListeners(): void {
    if (typeof window === 'undefined') {
      return;
    }

    // Hard navigations / tab close — best-effort flush + reset.
    window.addEventListener('beforeunload', () => {
      // We can't await an async flush here; we just kick it off so the
      // browser at least *attempts* a final POST.
      void this.flushBatch();
      this.clearObservedListings();
    });

    // SPA navigations (Facebook is a SPA). Poll for href changes — the
    // popstate event alone doesn't fire for pushState-driven nav.
    let lastUrl = window.location.href;
    this.navigationTimer = setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log('[WorthIT] Page navigation detected');
        void this.flushBatch();
        this.clearObservedListings();
      }
    }, this.NAV_POLL_MS);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Add freshly observed listings to the pending batch.
   *
   *  - Duplicates (by `listingId`, against the in-memory Set) are dropped.
   *  - If the batch reaches `BATCH_SIZE`, we flush immediately and any
   *    leftover observations from the same call are held for the next flush.
   *  - Otherwise, a 30-second timer is armed so partial batches don't sit
   *    forever.
   *
   * Never throws — bad input is logged and ignored.
   */
  addObservations(listings: ObservedListing[]): void {
    if (!Array.isArray(listings) || listings.length === 0) {
      return;
    }

    console.log(`[WorthIT] Adding ${listings.length} observations`);

    const newListings: ObservedListing[] = [];
    for (const listing of listings) {
      if (!listing || typeof listing.listingId !== 'string') {
        // Defensive: callers should give us validated objects, but skip
        // garbage rather than poisoning the Set with `undefined`.
        continue;
      }
      if (this.observedListings.has(listing.listingId)) {
        console.log(`[WorthIT] Skipping duplicate: ${listing.listingId}`);
        continue;
      }
      this.observedListings.add(listing.listingId);
      newListings.push(listing);
    }

    if (newListings.length === 0) {
      console.log('[WorthIT] All listings were duplicates');
      return;
    }

    this.batch.push(...newListings);
    console.log(
      `[WorthIT] Batch size now: ${this.batch.length}/${this.BATCH_SIZE}`,
    );

    // Drain in chunks of BATCH_SIZE so a giant single call doesn't sit
    // forever. The trailing remainder (<BATCH_SIZE) falls through to the
    // timer branch below.
    while (this.batch.length >= this.BATCH_SIZE) {
      console.log('[WorthIT] Batch full, sending immediately');
      // Synchronously detach the first BATCH_SIZE items and ship them.
      // We deliberately don't await — addObservations is sync from the
      // caller's perspective; failures are logged inside flushChunk.
      const chunk = this.batch.splice(0, this.BATCH_SIZE);
      void this.sendChunk(chunk);
    }

    // If we still have a partial batch and no timer is armed, arm one.
    if (this.batch.length > 0 && !this.batchTimer) {
      console.log(
        `[WorthIT] Setting batch timer for ${this.BATCH_TIMEOUT_MS}ms`,
      );
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null;
        void this.flushBatch();
      }, this.BATCH_TIMEOUT_MS);
    }
  }

  /**
   * Immediately ship whatever's in the pending batch. No-op if empty.
   * Always clears any pending flush timer.
   */
  async flushBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.batch.length === 0) {
      console.log('[WorthIT] No observations to flush');
      return;
    }

    const toSend = this.batch;
    this.batch = [];
    await this.sendChunk(toSend);
  }

  /**
   * Clear the in-session dedup Set. Use this when starting a fresh search
   * page so previously-seen IDs don't suppress legitimate re-observations.
   */
  clearObservedListings(): void {
    console.log(
      `[WorthIT] Clearing ${this.observedListings.size} observed listings`,
    );
    this.observedListings.clear();
  }

  /** Snapshot of current dedup-set size and pending batch length. */
  getStats(): MarketplaceObserverStats {
    return {
      observedCount: this.observedListings.size,
      batchSize: this.batch.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * POST a single chunk of observations to the backend. Errors are caught
   * and logged — we never re-throw and (per spec) never auto-retry. Task 7
   * will add retry/persistence on top of this.
   */
  private async sendChunk(chunk: ObservedListing[]): Promise<void> {
    if (chunk.length === 0) {
      return;
    }

    const payload: ObservePayload = {
      observations: chunk,
      timestamp: new Date().toISOString(),
    };

    console.log(`[WorthIT] Flushing batch of ${chunk.length} observations`);

    try {
      const response = await fetch(this.ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // Pull the body for diagnostics, but tolerate read failures.
        let body = '';
        try {
          body = await response.text();
        } catch {
          /* ignore */
        }
        console.warn(
          `[WorthIT] Batch failed: HTTP ${response.status}`,
          body,
        );
        return;
      }

      let result: ObserveResponse = {};
      try {
        result = (await response.json()) as ObserveResponse;
      } catch {
        // Server returned 2xx but invalid JSON — still a success from our
        // POV, just no `processed` count to log.
      }
      console.log(
        `[WorthIT] Batch sent successfully. Processed: ${result.processed ?? 'unknown'}`,
      );
    } catch (err) {
      console.error('[WorthIT] Failed to send batch:', err);
    }
  }
}
