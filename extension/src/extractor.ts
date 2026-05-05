import type { ExtractedListing } from './types';
import { isLikelyFbUiTitle } from './fb-title-filters';

const PRICE_PATTERN =
  /(?:₪|\$|€|£)\s?[\d,.]+|[\d,.]+\s?(?:₪|NIS|ILS|USD|EUR|GBP|US\$|[€£])/i;
const MAX_LISTINGS = 40;

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

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (rect.bottom < 0) return false;
  if (rect.top > window.innerHeight + 800) return false;
  return true;
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

function findPriceText(anchor: Element): string | null {
  let node: Element | null = anchor;
  for (let depth = 0; depth < 6 && node; depth += 1) {
    const text = getInnerText(node);
    const match = text.match(PRICE_PATTERN);
    if (match) return match[0];
    node = node.parentElement;
  }
  return null;
}

function findImage(anchor: Element): string | undefined {
  let node: Element | null = anchor;
  for (let depth = 0; depth < 6 && node; depth += 1) {
    const img = node.querySelector('img');
    if (img && img.src) return img.src;
    node = node.parentElement;
  }
  return undefined;
}

function dedupeKey(listing: ExtractedListing): string {
  if (listing.url) return listing.url.split('?')[0];
  return `${listing.title.trim().toLowerCase()}|${listing.price}`;
}

export function extractListings(): ExtractedListing[] {
  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/marketplace/item/"]'),
  );

  const seen = new Set<string>();
  const out: ExtractedListing[] = [];
  const pageCcy = fallbackCurrencyFromPage();

  for (const anchor of anchors) {
    if (out.length >= MAX_LISTINGS) break;
    if (!isVisible(anchor)) continue;

    const text = getInnerText(anchor);
    const lines = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const title = pickTitle(lines);
    if (!title) continue;
    if (isLikelyFbUiTitle(title)) continue;

    const priceText = findPriceText(anchor);
    const price = parsePrice(priceText);
    if (!price) continue;

    const currency = inferCurrencyFromPriceText(priceText ?? '') ?? pageCcy;

    let url: string | undefined;
    try {
      url = new URL(anchor.getAttribute('href') ?? '', location.origin).href;
    } catch {
      url = undefined;
    }

    const image = findImage(anchor);

    const listing: ExtractedListing = { title, price, currency, url, image };
    const key = dedupeKey(listing);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(listing);
  }

  return out;
}

export function extractQuery(): string {
  try {
    const params = new URL(location.href).searchParams;
    const q = params.get('query') ?? params.get('q');
    if (q && q.trim().length > 0) return q.trim();
  } catch {
    // fall through
  }
  const title = document.title.replace(/\s*\|\s*Facebook.*$/i, '').trim();
  return title || 'marketplace';
}
