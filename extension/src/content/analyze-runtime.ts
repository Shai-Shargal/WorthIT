import { analyzeProduct } from '../services/api.js';
import { extractActiveListing } from './extractor.js';
import { mountOverlay, type OverlayHandle } from './overlay.js';

let activeOverlay: OverlayHandle | null = null;
let lastAnalyzedUrl: string | null = null;
let urlWatchInterval: ReturnType<typeof setInterval> | null = null;

function isItemDetailPage(): boolean {
  return location.pathname.includes('/marketplace/item/');
}

// Close overlay if user navigates to a different product (SPA navigation).
// Clears any previous interval before starting a new one to prevent stacking.
function watchForUrlChange(): void {
  if (urlWatchInterval) clearInterval(urlWatchInterval);
  urlWatchInterval = setInterval(() => {
    if (activeOverlay && lastAnalyzedUrl && location.href !== lastAnalyzedUrl) {
      activeOverlay.remove();
      activeOverlay = null;
      lastAnalyzedUrl = null;
      clearInterval(urlWatchInterval!);
      urlWatchInterval = null;
    }
  }, 500);
}

// Persist the last-extracted URL on globalThis so it survives module
// re-executions within the same document (Facebook SPA never reloads
// the document, so this lives as long as the tab is open).
const _g = globalThis as typeof globalThis & {
  __worthit_lastUrl?: string;
};

function getLastExtractedUrl(): string | null {
  return _g.__worthit_lastUrl ?? null;
}
function setLastExtractedUrl(url: string): void {
  _g.__worthit_lastUrl = url;
}

// Wait for Facebook's SPA to finish rendering the listing at the current URL.
//
// Problem: SPA navigation updates location.href immediately, but the DOM
// (h1 title, price, description) still shows the PREVIOUS listing. Slow
// networks and variable re-render times mean even 2.5s isn't always enough.
//
// Solution: on URL change, wait 4 seconds (covers p99.9 of FB SPA times).
// Then poll extractActiveListing() until we get a valid product, with a
// safety re-extract at the end to catch any lingering stale data.
async function waitForFreshListing(timeoutMs = 10000): Promise<ReturnType<typeof extractActiveListing>> {
  const currentUrl = location.href;
  const lastUrl = getLastExtractedUrl();
  const isNewListing = lastUrl !== null && lastUrl !== currentUrl;

  // If this is a new listing, wait for the DOM to re-render.
  // 4s covers most cases; we also retry extraction below to be safe.
  if (isNewListing) {
    await new Promise((r) => setTimeout(r, 4000));
    if (location.href !== currentUrl) return null;
  }

  const deadline = Date.now() + timeoutMs;
  let lastAttempt: ReturnType<typeof extractActiveListing> | null = null;

  while (Date.now() < deadline) {
    if (location.href !== currentUrl) return null;

    const product = extractActiveListing();
    if (product && product.price > 0) {
      lastAttempt = product;
      // On new listing, do one final re-extract to confirm freshness.
      if (isNewListing) {
        await new Promise((r) => setTimeout(r, 200));
        const confirm = extractActiveListing();
        if (confirm && confirm.price > 0 && confirm.title === product.title) {
          setLastExtractedUrl(currentUrl);
          return confirm;
        }
        // If re-extract differs, keep trying (DOM still changing).
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      setLastExtractedUrl(currentUrl);
      return product;
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  // Fallback: if we got a valid product at any point, return the last one.
  // (Though we should always succeed before timeout.)
  return lastAttempt;
}

export async function runAnalyze(): Promise<void> {
  // Start watching for URL changes (handles SPA navigation)
  watchForUrlChange();

  // Analyze only works on item detail pages — browse/search pages collect passively
  if (!isItemDetailPage()) {
    const overlay = mountOverlay();
    activeOverlay = overlay;
    overlay.showError(
      'Open a specific listing to analyze it.',
      () => {},
    );
    return;
  }

  // Track this URL so we can detect if user navigates away
  lastAnalyzedUrl = location.href;

  const overlay = mountOverlay();
  activeOverlay = overlay;
  overlay.showLoading('Loading listing…');

  const product = await waitForFreshListing();
  if (!product) {
    overlay.showError(
      'Could not read this listing. Try reloading the page.',
      () => { void runAnalyze(); },
    );
    return;
  }

  overlay.showLoading(product.title);

  try {
    const response = await analyzeProduct(product);
    if (overlay !== activeOverlay) return;
    overlay.showResult(response);
  } catch (err) {
    if (overlay !== activeOverlay) return;
    const message = err instanceof Error ? err.message : 'Unknown error';
    overlay.showError(message, () => { void runAnalyze(); });
  }
}
