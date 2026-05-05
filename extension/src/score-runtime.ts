import { analyzeBulk } from './api';
import { extractListings, extractQuery } from './extractor';
import { mountOverlay, type OverlayHandle } from './overlay';

let activeOverlay: OverlayHandle | null = null;

export async function runScore(): Promise<void> {
  const overlay = mountOverlay();
  activeOverlay = overlay;

  const query = extractQuery();
  const listings = extractListings();

  if (listings.length === 0) {
    overlay.showError(
      'No visible listings detected on this page. Try scrolling and re-running.',
      () => {
        void runScore();
      },
    );
    return;
  }

  overlay.showLoading(query, listings.length);

  try {
    const response = await analyzeBulk({ query, listings });
    if (overlay !== activeOverlay) return;
    overlay.showResults(response);
  } catch (err) {
    if (overlay !== activeOverlay) return;
    const message = err instanceof Error ? err.message : 'Unknown error';
    overlay.showError(message, () => {
      void runScore();
    });
  }
}
