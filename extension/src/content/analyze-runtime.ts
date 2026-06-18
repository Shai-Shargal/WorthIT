import { analyzeProduct } from '../services/api.js';
import { extractActiveListing } from './extractor.js';
import { mountOverlay, type OverlayHandle } from './overlay.js';

let activeOverlay: OverlayHandle | null = null;

function isItemDetailPage(): boolean {
  return location.pathname.includes('/marketplace/item/');
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

  const product = extractActiveListing();
  if (!product) {
    const overlay = mountOverlay();
    activeOverlay = overlay;
    overlay.showError(
      'Could not read this listing. Try reloading the page.',
      () => { void runAnalyze(); },
    );
    return;
  }

  const overlay = mountOverlay();
  activeOverlay = overlay;
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
