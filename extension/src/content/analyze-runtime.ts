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

// Extract the numeric listing ID from a Facebook Marketplace item URL.
function listingIdFromUrl(url: string): string | null {
  return url.match(/\/marketplace\/item\/(\d+)/)?.[1] ?? null;
}

// The URL of the last listing we successfully extracted data from.
// Used to detect SPA navigation so we can wait for the DOM to re-render
// before extracting the new listing.
let lastExtractedUrl: string | null = null;

// Wait for Facebook's SPA to finish rendering the listing at the current URL.
//
// Problem: SPA navigation updates location.href immediately, but the DOM
// (h1 title, price, description) still shows the PREVIOUS listing for
// 500–1500 ms. Extracting immediately returns stale data under the new URL.
//
// Solution: track which URL we last extracted from. On a URL change, add a
// fixed 1.5 s wait — enough for Facebook to finish re-rendering — before
// we start extraction attempts. On the same URL (re-analyze same listing),
// no delay is added.
async function waitForFreshListing(timeoutMs = 6000): Promise<ReturnType<typeof extractActiveListing>> {
  const currentUrl = location.href;

  // New listing detected — wait for SPA re-render before reading the DOM.
  if (lastExtractedUrl !== null && lastExtractedUrl !== currentUrl) {
    await new Promise((r) => setTimeout(r, 1500));
    // Abort if the user navigated away again during the wait.
    if (location.href !== currentUrl) return null;
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (location.href !== currentUrl) return null;

    const product = extractActiveListing();
    if (product && product.price > 0) {
      lastExtractedUrl = currentUrl;
      return product;
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  return null;
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
