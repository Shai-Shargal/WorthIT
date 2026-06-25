/**
 * Passive collection content script.
 *
 * Decides what the current Facebook Marketplace page is and runs the matching
 * collection path:
 *
 *  - Item detail pages (`/marketplace/item/{id}`) → silently POST a single
 *    enriched listing (with description) to `/marketplace/observe`.
 *  - Search pages (matched by {@link isMarketplaceSearchPage}) → run the new
 *    {@link MarketplaceObserver}-based pipeline: extract cards with
 *    {@link extractListingsFromSearchPage} and let the observer handle
 *    dedup + batching + shipping.
 *  - Anything else (browse / category pages) → fall back to the legacy
 *    `extractFromAnchor` pipeline so we don't lose coverage while we roll out
 *    the new code.
 *
 * All work is best-effort: errors are logged with the `[WorthIT]` prefix and
 * swallowed. We never throw from a content script — that would interrupt the
 * user's normal browsing.
 *
 * Public functions are exported for unit testing. The module also auto-runs
 * {@link initPassiveCollect} when imported into a real content-script
 * environment; tests opt out by setting `globalThis.__WORTHIT_SKIP_AUTOINIT__`
 * before importing.
 */
import { extractFromAnchor, extractActiveListing, fallbackCurrencyFromPage } from './extractor.js';
import { getApiBase } from '../services/api.js';
import { isMarketplaceSearchPage } from '../marketplace/searchDetection.js';
import { extractListingsFromSearchPage } from '../marketplace/listingExtractor.js';
import { MarketplaceObserver } from '../marketplace/MarketplaceObserver.js';

export type PageType = 'item_detail' | 'search' | 'browse';

/** Detect which kind of marketplace page we're on, from the current URL. */
export function detectPageType(): PageType {
  if (typeof location === 'undefined') return 'browse';
  if (location.pathname.includes('/marketplace/item/')) return 'item_detail';
  if (isMarketplaceSearchPage(location.href)) return 'search';
  return 'browse';
}

// -----------------------------------------------------------------------------
// Item detail page (single listing, silent save)
// -----------------------------------------------------------------------------

export async function silentlySaveItemListing(): Promise<void> {
  // Wait for Facebook's client-side render to finish.
  await new Promise((resolve) => setTimeout(resolve, 2_000));

  const listing = extractActiveListing();
  if (!listing) return;

  const description =
    document
      .querySelector('meta[property="og:description"]')
      ?.getAttribute('content')
      ?.trim() || undefined;

  try {
    const base = await getApiBase();
    await fetch(`${base.replace(/\/$/, '')}/marketplace/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        observations: [{
          name: listing.title,
          price: listing.price,
          currency: listing.currency,
          description,
          url: listing.url,
        }],
      }),
    });
    console.debug(`[WorthIT] Saved item listing: ${listing.title}`);
  } catch {
    // Silent fail — never interrupt the user's browsing.
  }
}

// -----------------------------------------------------------------------------
// Search page (new pipeline — MarketplaceObserver does batching + dedup)
// -----------------------------------------------------------------------------

let searchObserver: MarketplaceObserver | null = null;
let searchScrollTimer: ReturnType<typeof setTimeout> | null = null;
let searchMutationObserver: MutationObserver | null = null;

/** Test seam: hard-reset module-level state between tests. */
export function __resetSearchCollectionForTests(): void {
  if (searchScrollTimer) clearTimeout(searchScrollTimer);
  if (searchMutationObserver) searchMutationObserver.disconnect();
  searchObserver = null;
  searchScrollTimer = null;
  searchMutationObserver = null;
}

/** Test seam: peek at the current observer (null if not started). */
export function __getSearchObserverForTests(): MarketplaceObserver | null {
  return searchObserver;
}

/**
 * Pull listings off the current page and hand them to the observer.
 *
 * Safe to call repeatedly — the observer deduplicates by `listingId`. Errors
 * from the extractor are logged and swallowed so a single bad page doesn't
 * tear down the scroll/mutation listeners.
 */
export function collectSearchListings(): void {
  if (!searchObserver) return;

  let listings;
  try {
    listings = extractListingsFromSearchPage();
  } catch (err) {
    console.warn('[WorthIT] Listing extraction failed:', err);
    return;
  }

  if (!listings || listings.length === 0) return;

  try {
    searchObserver.addObservations(listings);
  } catch (err) {
    console.warn('[WorthIT] Observer.addObservations failed:', err);
  }
}

/**
 * Wire up search-page collection: create the observer, drain what's already
 * on the page, then re-collect on scroll (infinite-scroll loads more cards)
 * and on DOM mutation (Facebook injects cards as you idle).
 */
export async function startSearchPageCollection(): Promise<void> {
  const apiBase = await getApiBase();
  searchObserver = new MarketplaceObserver(apiBase);

  // Drain what's already visible.
  collectSearchListings();

  if (typeof window === 'undefined') return;

  // Re-drain shortly after the user stops scrolling.
  window.addEventListener(
    'scroll',
    () => {
      if (searchScrollTimer) clearTimeout(searchScrollTimer);
      searchScrollTimer = setTimeout(() => {
        searchScrollTimer = null;
        collectSearchListings();
      }, 1_000);
    },
    { passive: true },
  );

  // Catch dynamically inserted cards. If a scroll re-drain is already armed
  // we skip — that timer will pick up the new cards.
  searchMutationObserver = new MutationObserver(() => {
    if (searchScrollTimer) return;
    collectSearchListings();
  });
  searchMutationObserver.observe(document.body, { childList: true, subtree: true });
}

// -----------------------------------------------------------------------------
// Browse / category page (legacy fallback)
// -----------------------------------------------------------------------------

type ObservationPayload = { name: string; price: number; currency: string; url?: string };

const seenUrls = new Set<string>();
const pending: ObservationPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let scrollTimer: ReturnType<typeof setTimeout> | null = null;

function collectVisible(): void {
  const pageCcy = fallbackCurrencyFromPage();
  const anchors = document.querySelectorAll<HTMLAnchorElement>('a[href*="/marketplace/item/"]');

  let added = 0;
  for (const anchor of anchors) {
    const rect = anchor.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    let url: string;
    try {
      url = new URL(anchor.getAttribute('href') ?? '', location.origin).href;
    } catch {
      continue;
    }

    if (seenUrls.has(url)) continue;

    const listing = extractFromAnchor(anchor, pageCcy);
    if (!listing) continue;

    seenUrls.add(url);
    pending.push({ name: listing.title, price: listing.price, currency: listing.currency, url });
    added++;
  }

  if (added > 0) scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer) return;
  // Wait 30 seconds after the first new listing is seen before sending.
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 30_000);
}

async function flush(): Promise<void> {
  if (pending.length === 0) return;
  const batch = pending.splice(0, 50);

  try {
    const base = await getApiBase();
    await fetch(`${base.replace(/\/$/, '')}/marketplace/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observations: batch }),
    });
    console.debug(`[WorthIT] Passively recorded ${batch.length} listings`);
  } catch {
    // Silent fail — never interrupt the user's browsing.
    pending.unshift(...batch); // Put back for next attempt.
  }
}

export function startPassiveCollection(): void {
  // Collect what's already visible.
  collectVisible();

  if (typeof window === 'undefined') return;

  // Collect after scrolling stops (infinite scroll loads new cards).
  window.addEventListener(
    'scroll',
    () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(collectVisible, 2_000);
    },
    { passive: true },
  );

  // Catch new cards added by Facebook's dynamic rendering.
  const observer = new MutationObserver(() => {
    if (scrollTimer) return; // Already scheduled.
    collectVisible();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------

/**
 * Decide what the page is and start the right collection path. Tests call
 * this directly; the bundle entry calls it at module load.
 */
export function initPassiveCollect(): PageType {
  const pageType = detectPageType();
  if (pageType === 'item_detail') {
    void silentlySaveItemListing();
  } else if (pageType === 'search') {
    void startSearchPageCollection();
  } else {
    startPassiveCollection();
  }
  return pageType;
}

// Auto-init in real (content-script) environments. Tests opt out by setting
// `globalThis.__WORTHIT_SKIP_AUTOINIT__ = true` before importing.
const _g = globalThis as { __WORTHIT_SKIP_AUTOINIT__?: boolean };
if (!_g.__WORTHIT_SKIP_AUTOINIT__) {
  initPassiveCollect();
}
