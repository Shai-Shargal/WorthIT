/**
 * Marketplace-agnostic listing types.
 *
 * These types are the common denominator across every supported marketplace
 * (Facebook, Yad2, and the upcoming eBay / Amazon providers). They must NOT
 * contain marketplace-specific fields; if a field is sometimes present, mark
 * it optional rather than adding a Yad2-only or Facebook-only shape.
 *
 * The interface that consumes these types lives in `../IMarketplaceExtractor.ts`.
 */

/**
 * Discriminator for the source marketplace.
 * Extend this union when adding a new provider (e.g. `| 'ebay' | 'amazon'`).
 */
export type Marketplace = 'facebook' | 'yad2';

/**
 * Minimal seller info scraped from a listing page.
 * `profileUrl` is optional because some marketplaces hide it for guest
 * scrapers.
 */
export interface RawSeller {
  name: string;
  profileUrl?: string;
}

/**
 * Normalized listing scraped from a marketplace page.
 *
 * Required fields (`title`, `price`, `currency`, `images`, `url`,
 * `marketplace`) are always populated, but extractors are permitted to set
 * them to safe defaults (`''`, `0`, `[]`) when the source HTML is malformed
 * or hydrated client-side — see edge case rules in the Phase 2 brief.
 *
 * Optional fields are returned as `undefined` when missing — never thrown.
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
