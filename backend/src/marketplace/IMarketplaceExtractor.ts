/**
 * Marketplace listing extractor abstraction.
 *
 * Each supported marketplace (Facebook, Yad2, ...) implements this interface
 * so the analyzer pipeline can pull a normalized {@link RawListing} from a URL
 * without caring about marketplace-specific DOM structure or APIs.
 *
 * Defined here (Backend Task 1) ahead of the factory in Backend Task 3.
 */

export type Marketplace = 'facebook' | 'yad2';

/**
 * Minimal seller info scraped from a listing page.
 * profileUrl is optional because some marketplaces hide it for guest scrapers.
 */
export interface RawSeller {
  name: string;
  profileUrl?: string;
}

/**
 * Normalized listing scraped from a marketplace page.
 * Optional fields are returned as `undefined` (NOT thrown) when the source
 * page is missing them — see edge case rules in the Phase 2 brief.
 */
export interface RawListing {
  title: string;
  price: number;
  currency: string;
  description?: string;
  seller?: RawSeller;
  images: string[];
  postedDate?: Date;
  url: string;
  marketplace: Marketplace;
}

export interface IMarketplaceExtractor {
  /**
   * Fetch the listing page at `url` and return a normalized RawListing.
   * Throws only on hard failures (network exhaustion, completely unparseable
   * page). Missing individual fields are surfaced as `undefined`.
   */
  extractListing(url: string): Promise<RawListing>;

  /**
   * Pure URL check — does this extractor recognize the URL as one it can
   * handle? Used by the factory in Backend Task 3.
   */
  validateUrl(url: string): boolean;
}
