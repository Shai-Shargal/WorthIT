/**
 * Listing extraction helpers for the passive collection pipeline.
 *
 * These functions parse Facebook Marketplace search result DOM into structured
 * {@link ObservedListing} records. They use multiple fallback selectors so
 * minor Facebook DOM changes do not break collection completely.
 */

import { getSearchQuery } from './searchDetection.js';
import type { ObservedListing } from './types.js';

// -----------------------------------------------------------------------------
// Selectors (ordered: most specific -> most generic)
// -----------------------------------------------------------------------------

const LISTING_ROOT_SELECTORS = [
  '[data-testid="marketplace_search_result"]',
  '[role="article"]',
  '.marketplace-item',
  'div[class*="listing"]',
] as const;

const TITLE_SELECTORS = [
  '[data-testid="listing_title"]',
  'h3',
  'span[class*="title"]',
] as const;

const PRICE_SELECTORS = [
  '[data-testid="listing_price"]',
  'span[class*="price"]',
  'div[class*="price"]',
] as const;

const LOCATION_SELECTORS = [
  '[data-testid="location"]',
  'span[class*="location"]',
  'div[class*="area"]',
] as const;

const IMAGE_SELECTORS = [
  'img[data-testid="listing_image"]',
  'img[class*="image"]',
  'img[class*="photo"]',
  'img[alt*="listing"]',
  'img',
] as const;

const SELLER_SELECTORS = [
  '[data-testid="seller_name"]',
  'a[class*="seller"]',
  'span[class*="seller"]',
  'div[class*="name"]',
] as const;

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
    // Both separators: the last one is the decimal separator.
    if (numStr.lastIndexOf('.') > numStr.lastIndexOf(',')) {
      // US: 1,000.99
      numStr = numStr.replace(/,/g, '');
    } else {
      // European: 1.000,99
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    }
  } else if (numStr.includes(',')) {
    const parts = numStr.split(',');
    // Two digits after the comma => decimal; otherwise thousands separator.
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

function firstNonEmptyText(element: Element, selectors: readonly string[]): string | null {
  for (const selector of selectors) {
    try {
      const found = element.querySelector(selector);
      const text = found?.textContent?.trim();
      if (text) return text;
    } catch {
      // Some selectors are unsupported in older engines; skip and continue.
    }
  }
  return null;
}

export function extractLocation(element: Element): string | null {
  return firstNonEmptyText(element, LOCATION_SELECTORS);
}

export function extractSellerName(element: Element): string | null {
  return firstNonEmptyText(element, SELLER_SELECTORS);
}

export function extractImageUrl(element: Element): string | null {
  for (const selector of IMAGE_SELECTORS) {
    try {
      const img = element.querySelector(selector) as HTMLImageElement | null;
      if (img) {
        // Prefer the live .src (jsdom resolves it absolute), fall back to attr.
        const src = (img.src && img.src.length > 0) ? img.src : img.getAttribute('src');
        if (src) return src;
      }
    } catch {
      // Skip and continue.
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// Top-level extractors
// -----------------------------------------------------------------------------

/**
 * Extract a single listing from a search result element. Returns `null` when
 * any *required* field (URL, listing id, title, parseable price) is missing.
 */
export function extractSingleListing(element: Element): ObservedListing | null {
  const linkEl = element.querySelector('a[href*="/marketplace/item/"]');
  const listingUrl = linkEl?.getAttribute('href');
  if (!listingUrl) return null;

  const listingId = extractListingId(listingUrl);
  if (!listingId) return null;

  const title = firstNonEmptyText(element, TITLE_SELECTORS);
  if (!title) return null;

  const priceText = firstNonEmptyText(element, PRICE_SELECTORS);
  const price = parsePrice(priceText);
  if (price < 0) return null;

  const location = extractLocation(element) ?? undefined;
  const imageUrl = extractImageUrl(element) ?? undefined;
  const sellerName = extractSellerName(element) ?? undefined;

  const currentHref = typeof window !== 'undefined' ? window.location.href : '';
  const searchQuery = getSearchQuery(currentHref) ?? '';

  return {
    marketplace: 'facebook',
    listingId,
    listingUrl,
    title,
    price,
    currency: 'ILS',
    location,
    imageUrl,
    sellerName,
    searchQuery,
    observedAt: new Date(),
  };
}

/**
 * Find listing cards on the current page and extract every parseable one.
 *
 * Iterates through fallback root selectors until one yields matches, then
 * extracts each card. Cards with missing required fields are skipped (not
 * thrown). Returns an empty array when nothing parses.
 */
export function extractListingsFromSearchPage(): ObservedListing[] {
  if (typeof document === 'undefined') return [];

  let elements: Element[] = [];
  for (const selector of LISTING_ROOT_SELECTORS) {
    try {
      const found = document.querySelectorAll(selector);
      if (found.length > 0) {
        elements = Array.from(found);
        break;
      }
    } catch {
      // Ignore selectors unsupported by the host engine.
    }
  }

  if (elements.length === 0) return [];

  const listings: ObservedListing[] = [];
  for (const element of elements) {
    try {
      const listing = extractSingleListing(element);
      if (listing) listings.push(listing);
    } catch {
      // Never abort the whole batch because one card threw.
    }
  }
  return listings;
}
