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

// Meta selectors must use document scope — metas live in <head>, not inside main
const TITLE_META_SELECTORS = ['meta[property="og:title"]'] as const;
// On Facebook item pages the DOM h1 is more reliable than og:title, which the
// SPA sometimes leaves as "חדש בשבילך" / "New for you" stale chrome.
const TITLE_DOM_SELECTORS = ['h1', '[data-testid="item-title"]', 'h2', '[role="heading"]'] as const;

function extractTitle(main: Element): string | null {
  // DOM headings first — far more reliable than og:title on Facebook's SPA.
  for (const selector of TITLE_DOM_SELECTORS) {
    try {
      const el = main.querySelector(selector);
      if (el) {
        const text = getInnerText(el).trim()
          .replace(/\s*[|–—-]\s*Facebook\s*$/i, '').trim();
        if (text && !isLikelyFbUiTitle(text)) return text;
      }
    } catch { /* skip */ }
  }

  // og:title fallback — only if DOM yielded nothing useful.
  for (const selector of TITLE_META_SELECTORS) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const text = (el.getAttribute('content') ?? getInnerText(el)).trim()
          .replace(/\s*[|–—-]\s*Facebook\s*$/i, '').trim();
        if (text && !isLikelyFbUiTitle(text)) return text;
      }
    } catch { /* skip */ }
  }

  // Last resort: pick from text lines within main
  const lines = getInnerText(main).split('\n').map((s) => s.trim()).filter(Boolean);
  return pickTitle(lines) || null;
}

// Containers that wrap the listing's own title + price on item pages.
// We prefer scanning these before falling back to all-of-main, so we don't
// accidentally pick up prices from "Similar listings" / sidebar cards.
const LISTING_CONTAINER_SELECTORS = [
  '[data-testid="marketplace_pdp_component"]',
  '[data-testid="marketplace_listing_item"]',
  'div[data-pagelet="MarketplacePDP"]',
] as const;

function findListingContainer(main: Element): Element {
  for (const sel of LISTING_CONTAINER_SELECTORS) {
    try {
      const el = main.querySelector(sel);
      if (el) return el;
    } catch { /* skip */ }
  }
  // Narrow heuristic: the h1 is in the listing block — walk up to a
  // reasonable ancestor that won't include the recommendations rail.
  const h1 = main.querySelector('h1');
  if (h1) {
    // Walk up at most 6 levels, stop if the container gets too big
    let node: Element | null = h1.parentElement;
    for (let i = 0; i < 6 && node && node !== main; i++) {
      if (node.querySelectorAll('h1').length === 1) return node;
      node = node.parentElement;
    }
  }
  return main;
}

function extractPrice(main: Element): { price: number | null; text: string | null } {
  // Narrow scope: find the listing container first so DOM text scan doesn't
  // hit sidebar recommendation prices.
  const container = findListingContainer(main);

  const priceSources = [
    // og:price:amount is authoritative when present (document-scoped)
    () => document.querySelector('meta[property="og:price:amount"]')?.getAttribute('content'),
    // data-testid selectors — most specific
    () => container.querySelector('[data-testid="item-price"]')?.textContent?.trim(),
    // aria-label on the shekel icon span
    () => container.querySelector('span[role="img"][aria-label*="₪"]')?.getAttribute('aria-label'),
    // Scoped text scan — listing container only, not all of main
    () => findPriceText(container),
    // Last resort: full main (catches edge cases where container heuristic failed)
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

// Facebook product images consistently carry referrerpolicy; use that as primary signal.
// The bare 'img' fallback catches any remaining cases.
const IMAGE_SELECTORS = [
  'img[referrerpolicy]',
  'img[src*="fbcdn.net"]',
  'img',
] as const;

function extractImage(main: Element): string | undefined {
  for (const selector of IMAGE_SELECTORS) {
    try {
      const img = main.querySelector<HTMLImageElement>(selector);
      if (img?.src && img.src.length < 2048) return img.src;
    } catch { /* skip broken selector */ }
  }
  return undefined;
}

// Selectors for the seller's description text block on Facebook item pages.
const DESCRIPTION_DOM_SELECTORS = [
  '[data-testid="item-description"]',
  '[data-testid="marketplace_listing_item_description"]',
] as const;

function extractDescription(main: Element): string | undefined {
  // Try specific data-testid selectors first.
  for (const selector of DESCRIPTION_DOM_SELECTORS) {
    try {
      const el = main.querySelector(selector);
      if (el) {
        const text = getInnerText(el).trim();
        if (text.length > 10) return text.slice(0, 5000);
      }
    } catch { /* skip */ }
  }

  // og:description fallback — sometimes populated on item pages.
  const meta = document
    .querySelector('meta[property="og:description"]')
    ?.getAttribute('content')
    ?.trim();
  if (meta && meta.length > 10) return meta.slice(0, 5000);

  // Last resort: find the largest text block inside the listing container
  // that isn't the title or price. Looks for a <div> or <span> with enough
  // prose text to be a seller description (> 40 chars, not all digits/symbols).
  const container = findListingContainer(main);
  const title = extractTitle(main) ?? '';
  const candidates = Array.from(container.querySelectorAll('div, span, p'));
  for (const el of candidates) {
    // Skip elements that contain child elements with significant text
    // (we want leaf-ish nodes with the actual prose)
    if (el.querySelectorAll('div, p').length > 3) continue;
    const text = getInnerText(el as Element).trim();
    if (
      text.length > 40 &&
      text !== title &&
      !PRICE_PATTERN.test(text.slice(0, 20)) &&
      (text.match(/\p{L}/gu)?.length ?? 0) > 20
    ) {
      return text.slice(0, 5000);
    }
  }

  return undefined;
}

function logExtractionError(field: string, url: string, attempted: string[]): void {
  console.warn(`[extractor] Failed to extract ${field} from ${url}. Tried: ${attempted.join(', ')}`);
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
        ...TITLE_META_SELECTORS,
        ...TITLE_DOM_SELECTORS,
        'text lines',
      ]);
      return null;
    }

    const { price, text: priceText } = extractPrice(main);
    if (!price) {
      logExtractionError('price', location.href, [
        'meta[og:price:amount]',
        '[data-testid="item-price"]',
        'span[role="img"][aria-label*="₪"]',
        'DOM text scan',
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

    // Facebook's og:description is often empty or stale on item pages.
    // Read from the DOM first (same strategy as title extraction), then fall
    // back to og:description. DOM selectors target the seller's text block.
    const description = extractDescription(main);

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
