/**
 * Search-page detection helpers for the passive collection pipeline.
 *
 * These functions are URL-only (no DOM access) so they can be safely called
 * from background scripts, content scripts, or tests under jsdom.
 */

const SEARCH_PATTERNS: RegExp[] = [
  // Desktop and city-prefixed: facebook.com/marketplace/.../search
  /https?:\/\/(?:[\w-]+\.)*facebook\.com\/marketplace\/[^?#]*?search/i,
  // Bare desktop search: facebook.com/marketplace/search
  /https?:\/\/(?:[\w-]+\.)*facebook\.com\/marketplace\/search/i,
];

const FACEBOOK_HOSTS = /(?:^|\.)facebook\.com$/i;

/** Returns true if the URL is a Facebook Marketplace *search* page. */
export function isMarketplaceSearchPage(url: string): boolean {
  if (!url) return false;
  return SEARCH_PATTERNS.some((p) => p.test(url));
}

/** Extracts the `?query=` parameter from a marketplace URL, or `null`. */
export function getSearchQuery(url: string): string | null {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('query');
  } catch {
    // Swallow malformed URLs - callers treat null as "no query".
    return null;
  }
}

/**
 * Returns the marketplace identifier for the URL.
 *
 * Currently only Facebook is supported. Returns `null` for everything else
 * (including Yad2, which is handled server-side).
 */
export function detectMarketplaceType(url: string): 'facebook' | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    if (FACEBOOK_HOSTS.test(host)) return 'facebook';
    return null;
  } catch {
    // Fall back to a regex check for already-stripped strings.
    return /facebook\.com/i.test(url) ? 'facebook' : null;
  }
}
