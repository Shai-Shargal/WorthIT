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

// Extract the listing ID from a Facebook Marketplace URL.
function listingIdFromUrl(url: string): string | null {
  const match = url.match(/\/marketplace\/item\/(\d+)/);
  return match?.[1] ?? null;
}

// Wait for Facebook's SPA to finish rendering the listing at the current URL.
//
// Problem: SPA navigation updates location.href immediately, but the DOM
// (h1 title, price, description) still shows the PREVIOUS listing for
// 500–3000 ms. Extracting immediately returns stale data.
//
// Solution: extract the listing ID from the DOM (via og:url, which Facebook
// updates with the DOM). Poll until the DOM's listing ID matches the URL's
// listing ID, guaranteeing freshness of the actual content.
async function waitForFreshListing(timeoutMs = 8000): Promise<ReturnType<typeof extractActiveListing>> {
  const currentUrl = location.href;
  const targetListingId = listingIdFromUrl(currentUrl);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (location.href !== currentUrl) return null;

    // Read the listing ID from og:url meta tag — Facebook updates this
    // together with the DOM, so it's a reliable indicator of freshness.
    const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? '';
    const domListingId = listingIdFromUrl(ogUrl);

    // If we have a target ID and it doesn't match the DOM yet, the DOM is
    // still stale — keep waiting.
    if (targetListingId && domListingId && domListingId !== targetListingId) {
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }

    // DOM appears fresh (or we can't determine — extract and let the caller decide).
    const product = extractActiveListing();
    if (product && product.price > 0) {
      setLastExtractedUrl(currentUrl);
      return product;
    }

    await new Promise((r) => setTimeout(r, 200));
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
