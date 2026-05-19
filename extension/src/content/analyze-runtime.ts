import { analyzeProduct } from '../services/api.js';
import { extractActiveListing } from './extractor.js';
import { mountOverlay, type OverlayHandle } from './overlay.js';

let activeOverlay: OverlayHandle | null = null;

export async function runAnalyze(): Promise<void> {
  const overlay = mountOverlay();
  activeOverlay = overlay;

  const product = extractActiveListing();
  if (!product) {
    overlay.showError(
      'No listing detected on this page. Open a product listing or scroll to a visible card.',
      () => {
        void runAnalyze();
      },
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
    overlay.showError(message, () => {
      void runAnalyze();
    });
  }
}
