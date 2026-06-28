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
// (h1 title, price, description) still shows the PREVIOUS listing for
// 500–2000 ms. Extracting immediately returns stale data under the new URL.
//
// Solution: on URL change, use a MutationObserver to detect when the main
// content area actually updates (text/structure changes). Once mutations are
// detected on the main element, the new listing is being rendered. Extract
// then, or use a 2.5 s hard timeout as fallback.
async function waitForFreshListing(timeoutMs = 7000): Promise<ReturnType<typeof extractActiveListing>> {
  const currentUrl = location.href;
  const lastUrl = getLastExtractedUrl();
  const isNewListing = lastUrl !== null && lastUrl !== currentUrl;

  if (isNewListing) {
    // Wait for the main content area to be mutated (Facebook re-renders the listing).
    await new Promise<void>((resolve) => {
      const main = document.querySelector('[role="main"]') ?? document.querySelector('div[data-pagelet]');
      if (!main) {
        // Fallback if we can't find the main element — just wait a fixed time.
        setTimeout(resolve, 2500);
        return;
      }

      const observer = new MutationObserver(() => {
        observer.disconnect();
        // Give the DOM a moment to finish rendering after the mutation.
        setTimeout(resolve, 200);
      });

      // Watch for content changes (textContent, structure).
      observer.observe(main, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      // Hard timeout: if mutations don't fire within 2.5s, stop waiting.
      setTimeout(() => {
        observer.disconnect();
        resolve();
      }, 2500);
    });

    // Abort if user navigated again during the wait.
    if (location.href !== currentUrl) return null;
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (location.href !== currentUrl) return null;

    const product = extractActiveListing();
    if (product && product.price > 0) {
      setLastExtractedUrl(currentUrl);
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
