import type { ProductInput } from '../../../shared/types/index.js';
import { extractFromAnchor, fallbackCurrencyFromPage } from './extractor.js';

const OVERLAY_ID = 'worthit-select-overlay';
const STYLE_ID = 'worthit-select-style';

export type SelectionResult =
  | { kind: 'picked'; product: ProductInput }
  | { kind: 'cancelled' }
  | { kind: 'extraction_failed' };

export function enterSelectionMode(): Promise<SelectionResult> {
  return new Promise((resolve) => {
    // Dim overlay — pointer-events none so cards remain clickable
    const dimEl = document.createElement('div');
    dimEl.id = OVERLAY_ID;
    Object.assign(dimEl.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.35)',
      zIndex: '2147483640',
      pointerEvents: 'none',
    });
    document.body.appendChild(dimEl);

    // CSS for card highlight on hover
    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = `
      a[href*="/marketplace/item/"]:hover {
        outline: 3px solid #22c55e !important;
        outline-offset: 3px !important;
        cursor: pointer !important;
        position: relative;
        z-index: 2147483641 !important;
      }
    `;
    document.head.appendChild(styleEl);

    function cleanup(): void {
      document.getElementById(OVERLAY_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
      document.removeEventListener('click', onCardClick, true);
      document.removeEventListener('keydown', onKeyDown);
    }

    function onCardClick(e: MouseEvent): void {
      const anchor = (e.target as Element).closest(
        'a[href*="/marketplace/item/"]',
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      const product = extractFromAnchor(anchor, fallbackCurrencyFromPage());
      if (product === null) {
        resolve({ kind: 'extraction_failed' });
      } else {
        resolve({ kind: 'picked', product });
      }
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        cleanup();
        resolve({ kind: 'cancelled' });
      }
    }

    document.addEventListener('click', onCardClick, true);
    document.addEventListener('keydown', onKeyDown);
  });
}
