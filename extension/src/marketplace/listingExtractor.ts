/**
 * Listing extraction for Facebook Marketplace search pages.
 *
 * DOM facts verified against live pages (2026-06-28):
 *   - The <a href="/marketplace/item/{id}/…"> tag wraps the entire card.
 *   - <img alt="{title} in {city}, {district}"> is inside every card link.
 *   - The first ₪-prefixed text node is the current price (a second one, if
 *     present, is the struck-through original price — we ignore it).
 *   - No stable role, data-testid, or class exists on the card container.
 *
 * Strategy: enumerate unique item links, derive everything from the <a> itself.
 * No CSS class names. No card-root walking.
 */

import { getSearchQuery } from './searchDetection.js';
import type { ObservedListing } from './types.js';

const PRICE_TEXT_RE = /[₪$€£]([\d,. ]+)/;

// -----------------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------------

/** Extracts the numeric listing id from `/marketplace/item/{id}`. */
export function extractListingId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/marketplace\/item\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Parses a price string into a rounded integer.
 *
 * Handles:
 *   "₪ 1,700"  -> 1700
 *   "$500"     -> 500
 *   "1,500.99" -> 1501  (US format, rounded)
 *   "1.000,99" -> 1001  (European format, rounded)
 *   "1700 ILS" -> 1700
 *
 * Returns `-1` for unparseable input. Callers use that as a "skip this
 * listing" signal so we do not pollute the corpus with $0 / NaN observations.
 */
export function parsePrice(text: string | null | undefined): number {
  if (text === null || text === undefined) return -1;
  const stripped = String(text).replace(/[^\d.,]/g, '');
  if (!stripped) return -1;

  const match = stripped.match(/[\d.,]+/);
  if (!match) return -1;

  let numStr = match[0];

  if (numStr.includes(',') && numStr.includes('.')) {
    if (numStr.lastIndexOf('.') > numStr.lastIndexOf(',')) {
      numStr = numStr.replace(/,/g, '');
    } else {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    }
  } else if (numStr.includes(',')) {
    const parts = numStr.split(',');
    if (parts.length === 2 && parts[1].length === 2) {
      numStr = numStr.replace(',', '.');
    } else {
      numStr = numStr.replace(/,/g, '');
    }
  }

  const num = parseFloat(numStr);
  if (!Number.isFinite(num)) return -1;
  return Math.round(num);
}

// -----------------------------------------------------------------------------
// DOM helpers
// -----------------------------------------------------------------------------

/**
 * Walks text nodes inside `element` and returns the first one that looks like
 * a price (leading currency symbol). Returns `null` if none found.
 */
function extractPriceTextNode(element: Element): string | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim();
    if (text && PRICE_TEXT_RE.test(text)) return text;
  }
  return null;
}

/**
 * Splits `img[alt]` on the last occurrence of ` in ` to extract title and
 * location. Facebook formats this as "{title} in {city}, {district}".
 * Returns `[null, undefined]` when the pattern is absent.
 */
function splitImgAlt(alt: string): [string | null, string | undefined] {
  const sep = ' in ';
  const idx = alt.lastIndexOf(sep);
  if (idx <= 0) return [null, undefined];
  return [alt.substring(0, idx).trim() || null, alt.substring(idx + sep.length).trim() || undefined];
}

/**
 * Fallback title extraction from the link's `aria-label`.
 * Format: "{title}, {currency}{price}, {city}, {district}, listing {id}"
 * The `, {currency_symbol}` sequence marks where the title ends.
 */
function titleFromAriaLabel(ariaLabel: string): string | null {
  const idx = ariaLabel.search(/, [₪$€£]/);
  if (idx <= 0) return null;
  return ariaLabel.substring(0, idx).trim() || null;
}

// -----------------------------------------------------------------------------
// Top-level extractors
// -----------------------------------------------------------------------------

/**
 * Extracts a listing from a single `<a href="/marketplace/item/…">` element.
 * Returns `null` when any required field (id, title, parseable price) is absent.
 */
export function extractSingleListing(link: HTMLAnchorElement): ObservedListing | null {
  const href = link.getAttribute('href');
  const listingId = extractListingId(href);
  if (!listingId || !href) return null;

  const img = link.querySelector('img');
  const [imgTitle, location] = splitImgAlt(img?.getAttribute('alt') ?? '');

  const title = imgTitle ?? titleFromAriaLabel(link.getAttribute('aria-label') ?? '');
  if (!title) return null;

  const priceText = extractPriceTextNode(link);
  const price = parsePrice(priceText);
  if (price < 0) return null;

  const imageUrl = img ? (img.src || img.getAttribute('src') || undefined) : undefined;

  const searchQuery = typeof window !== 'undefined'
    ? (getSearchQuery(window.location.href) ?? '')
    : '';

  return {
    marketplace: 'facebook',
    listingId,
    listingUrl: href,
    title,
    price,
    currency: 'ILS',
    location,
    imageUrl: imageUrl || undefined,
    searchQuery,
    observedAt: new Date(),
  };
}

/**
 * Finds all listing cards on the current search page and extracts every
 * parseable one. Cards with missing required fields are skipped silently.
 * Returns an empty array when no listings are found or the DOM is unavailable.
 */
export function extractListingsFromSearchPage(): ObservedListing[] {
  if (typeof document === 'undefined') return [];

  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/marketplace/item/"]'),
  );

  const seen = new Set<string>();
  const listings: ObservedListing[] = [];

  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    const idMatch = href.match(/\/marketplace\/item\/(\d+)/);
    if (!idMatch || seen.has(idMatch[1])) continue;
    seen.add(idMatch[1]);

    try {
      const listing = extractSingleListing(link);
      if (listing) listings.push(listing);
    } catch {
      // Never abort the whole batch because one card threw.
    }
  }

  return listings;
}
