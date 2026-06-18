import { analyzeProduct } from '../services/api.js';
import { extractActiveListing } from './extractor.js';
import { mountOverlay, type OverlayHandle } from './overlay.js';

let activeOverlay: OverlayHandle | null = null;

function isItemDetailPage(): boolean {
  return location.pathname.includes('/marketplace/item/');
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
