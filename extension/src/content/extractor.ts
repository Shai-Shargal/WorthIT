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

export function fallbackCurrencyFromPage(): string {
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

export function extractFromAnchor(anchor: HTMLAnchorElement, pageCcy: string): ProductInput | null {
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

function extractTitle(main: Element): string | null {
  const selectors = [
    'meta[property="og:title"]',
    'h1',
    'h2',
    '[data-testid="item-title"]',
    '[role="heading"]',
  ];

  for (const selector of selectors) {
    try {
      const el = main.querySelector(selector);
      if (el) {
        const text = el.getAttribute('content') || getInnerText(el);
        const cleaned = text.trim().replace(/\s*[|–—-]\s*Facebook\s*$/i, '').trim();
        if (cleaned && !isLikelyFbUiTitle(cleaned)) return cleaned;
      }
    } catch {
      // Selector failed, continue to next
    }
  }

  // Last resort: pick from text lines
  const lines = getInnerText(main)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return pickTitle(lines) || null;
}

function extractPrice(main: Element): { price: number | null; text: string | null } {
  const priceSources = [
    () => document.querySelector('meta[property="og:price:amount"]')?.getAttribute('content'),
    () => main.querySelector('[data-testid="item-price"]')?.textContent?.trim(),
    () => main.querySelector('span[role="img"][aria-label*="₪"]')?.getAttribute('aria-label'),
    () => findPriceText(main),
  ];

  for (const source of priceSources) {
    try {
      const priceText = source();
      if (priceText) {
        const price = parsePrice(priceText);
        if (price) return { price, text: priceText };
      }
    } catch {
      // Source failed, continue
    }
  }

  return { price: null, text: null };
}

function extractImage(main: Element): string | undefined {
  const selectors = [
    'img[alt*="product"], img[alt*="item"]',
    'img[loading]',
    'img[src*="marketplace"]',
    'img',
  ];

  for (const selector of selectors) {
    try {
      const img = main.querySelector<HTMLImageElement>(selector);
      if (img?.src && img.src.length < 2048) return img.src;
    } catch {
      // Selector failed
    }
  }

  return undefined;
}

function logExtractionError(field: string, url: string, attempted: string[]): void {
  const msg = `[extractor] Failed to extract ${field} from ${url}. Tried: ${attempted.join(', ')}`;
  console.warn(msg);

  // Try to log to Sentry if available (loaded via extension CSP)
  if (typeof window !== 'undefined' && (window as any).Sentry) {
    (window as any).Sentry.captureMessage(msg, 'warning');
  }
}

/** Extract the active marketplace listing (item page or first visible card). */
export function extractActiveListing(): ProductInput | null {
  const pageCcy = fallbackCurrencyFromPage();

  if (location.pathname.includes('/marketplace/item/')) {
    const main =
      document.querySelector('[role="main"]') ??
      document.querySelector('div[data-pagelet]') ??
      document.body;

    const title = extractTitle(main);
    if (!title) {
      logExtractionError('title', location.href, [
        'og:title',
        'h1',
        'h2',
        'data-testid=item-title',
        'text lines',
      ]);
      return null;
    }

    const { price, text: priceText } = extractPrice(main);
    if (!price) {
      logExtractionError('price', location.href, [
        'og:price:amount',
        'data-testid=item-price',
        'aria-label with ₪',
        'DOM scan',
      ]);
      return null;
    }

    const ogCurrency = document
      .querySelector('meta[property="og:price:currency"]')
      ?.getAttribute('content');

    const currency =
      ogCurrency?.trim().toUpperCase() ||
      inferCurrencyFromPriceText(priceText ?? '') ||
      pageCcy;

    const image = extractImage(main);

    // og:description holds the seller's written description on item pages
    const description =
      document
        .querySelector('meta[property="og:description"]')
        ?.getAttribute('content')
        ?.trim() || undefined;

    return {
      title,
      price,
      currency,
      description,
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
