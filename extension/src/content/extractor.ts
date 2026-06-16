import type { ProductInput } from '../../../shared/types/index.js';
import { isLikelyFbUiTitle } from '../utils/fb-title-filters.js';

const PRICE_PATTERN =
  /(?:₪|\$|€|£)\s?[\d,.]+|[\d,.]+\s?(?:₪|NIS|ILS|USD|EUR|GBP|US\$|[€£])/i;

function inferCurrencyFromPriceText(snippet: string): string | null {
  if (/₪|\bNIS\b|\bILS\b/i.test(snippet)) return 'ILS';
  if (/€|\bEUR\b/i.test(snippet)) return 'EUR';
  if (/£|\bGBP\b/i.test(snippet)) return 'GBP';
  if (/\$\s*\d|[\d,.]+\s*\$|\bUSD\b|\bUS\$/i.test(snippet)) return 'USD';
  return null;
}

function fallbackCurrencyFromPage(): string {
  const lang =
    document.documentElement.getAttribute('lang') ??
    (typeof navigator !== 'undefined' ? navigator.language : '') ??
    '';
  if (/^(he|iw)/i.test(lang)) return 'ILS';
  return 'USD';
}

function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.replace(/[^\d.,]/g, '').trim();
  if (!normalized) return null;
  const numeric = Number(normalized.replace(/,/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

function getInnerText(el: Element | null | undefined): string {
  if (!el) return '';
  const html = el as HTMLElement;
  return html.innerText ?? html.textContent ?? '';
}

function pickTitle(lines: string[]): string {
  return (
    lines.find((line) => line.length > 1 && !PRICE_PATTERN.test(line)) ?? lines[0] ?? ''
  );
}

function findPriceText(root: Element): string | null {
  const text = getInnerText(root);
  const match = text.match(PRICE_PATTERN);
  return match ? match[0] : null;
}

function findImage(root: Element): string | undefined {
  const img = root.querySelector('img');
  return img?.src || undefined;
}

function extractFromAnchor(anchor: HTMLAnchorElement, pageCcy: string): ProductInput | null {
  const text = getInnerText(anchor);
  const lines = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const title = pickTitle(lines);
  if (!title || isLikelyFbUiTitle(title)) return null;

  const priceText = findPriceText(anchor);
  const price = parsePrice(priceText);
  if (!price) return null;

  const currency = inferCurrencyFromPriceText(priceText ?? '') ?? pageCcy;

  let url: string | undefined;
  try {
    url = new URL(anchor.getAttribute('href') ?? '', location.origin).href;
  } catch {
    url = undefined;
  }

  return { title, price, currency, url, image: findImage(anchor) };
}

/** Extract the active marketplace listing (item page or first visible card). */
export function extractActiveListing(): ProductInput | null {
  const pageCcy = fallbackCurrencyFromPage();

  if (location.pathname.includes('/marketplace/item/')) {
    const main =
      document.querySelector('[role="main"]') ??
      document.querySelector('div[data-pagelet]') ??
      document.body;

    const title =
      (main as Element).querySelector('h1')?.textContent?.trim() ??
      pickTitle(
        getInnerText(main)
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      );

    if (!title || isLikelyFbUiTitle(title)) return null;

    const priceText = findPriceText(main);
    const price = parsePrice(priceText);
    if (!price) return null;

    const currency = inferCurrencyFromPriceText(priceText ?? '') ?? pageCcy;
    const image = findImage(main);

    return {
      title,
      price,
      currency,
      url: location.href,
      image,
    };
  }

  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/marketplace/item/"]'),
  );

  for (const anchor of anchors) {
    const rect = anchor.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight + 400) continue;

    const listing = extractFromAnchor(anchor, pageCcy);
    if (listing) return listing;
  }

  return null;
}
