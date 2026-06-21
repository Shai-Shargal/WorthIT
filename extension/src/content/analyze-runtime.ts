import { analyzeProduct } from '../services/api.js';
import { extractActiveListing } from './extractor.js';
import { mountOverlay, type OverlayHandle } from './overlay.js';

let activeOverlay: OverlayHandle | null = null;
let lastAnalyzedUrl: string | null = null;

function isItemDetailPage(): boolean {
  return location.pathname.includes('/marketplace/item/');
}

// Close overlay if user navigates to a different product (SPA navigation)
function watchForUrlChange(): void {
  const checkUrl = (): void => {
    if (activeOverlay && lastAnalyzedUrl && location.href !== lastAnalyzedUrl) {
      activeOverlay.remove();
      activeOverlay = null;
    }
  };
  // Check every 500ms for URL changes (handles Facebook's SPA routing)
  setInterval(checkUrl, 500);
}

// Wait for Facebook's SPA to finish updating og:meta after navigation.
// og:title lags behind the URL — retry until it no longer looks stale.
async function waitForFreshListing(timeoutMs = 4000): Promise<ReturnType<typeof extractActiveListing>> {
  const deadline = Date.now() + timeoutMs;
  let product = extractActiveListing();

  while (Date.now() < deadline) {
    product = extractActiveListing();
    if (product && product.price > 0) {
      // Sanity check: price must be plausible (not a stale ₪0 or obviously wrong)
      return product;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return product;
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
