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
// e.g. "https://www.facebook.com/marketplace/item/4375988652666501/?..." → "4375988652666501"
function listingIdFromUrl(url: string): string | null {
  return url.match(/\/marketplace\/item\/(\d+)/)?.[1] ?? null;
}

// Read the listing ID that the DOM currently reflects. Facebook updates the
// og:url meta tag alongside the DOM content, so it reliably tells us which
// listing is actually rendered — unlike location.href which changes first.
function domListingId(): string | null {
  const ogUrl =
    document.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? '';
  return listingIdFromUrl(ogUrl);
}

// Wait for Facebook's SPA to finish rendering the listing at the current URL.
// Problem: SPA navigation updates location.href immediately but the DOM
// (title, price, description) still shows the previous listing for 500-1500ms.
// Naive extraction returns stale data with the new URL attached.
//
// Solution: compare the listing ID in location.href against the ID reflected
// in og:url (which Facebook updates together with the DOM). Only extract once
// they match — meaning the DOM has caught up with the URL.
async function waitForFreshListing(timeoutMs = 6000): Promise<ReturnType<typeof extractActiveListing>> {
  const deadline = Date.now() + timeoutMs;
  const currentUrl = location.href;
  const targetId = listingIdFromUrl(currentUrl);

  while (Date.now() < deadline) {
    // Abort if user navigated away while we were waiting.
    if (location.href !== currentUrl) return null;

    // If we can identify the target listing ID, wait until the DOM reflects it.
    if (targetId) {
      const domId = domListingId();
      if (domId && domId !== targetId) {
        // DOM is still showing the previous listing — wait for re-render.
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
    }

    const product = extractActiveListing();
    if (product && product.price > 0) return product;

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
