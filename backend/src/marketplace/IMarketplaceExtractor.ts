/**
 * Marketplace listing extractor abstraction.
 *
 * Each supported marketplace (Facebook, Yad2, ...) implements this interface
 * so the analyzer pipeline can pull a normalized {@link RawListing} from a URL
 * without caring about marketplace-specific DOM structure or APIs.
 *
 * The {@link MarketplaceExtractorFactory} (Backend Task 3) routes a URL to
 * the correct concrete extractor.
 */

import type { Marketplace, RawListing, RawSeller } from './types/RawListing.js';

// Re-export the listing types so existing call-sites that import them from
// this file (e.g. `import type { RawListing } from '.../IMarketplaceExtractor.js'`)
// keep working. New code should prefer `./types/RawListing.js` directly.
export type { Marketplace, RawListing, RawSeller };

export interface IMarketplaceExtractor {
  /**
   * Fetch the listing page at `url` and return a normalized RawListing.
   * Throws only on hard failures (network exhaustion, completely unparseable
   * page). Missing individual fields are surfaced as `undefined`.
   */
  extractListing(url: string): Promise<RawListing>;

  /**
   * Pure URL check — does this extractor recognize the URL as one it can
   * handle? Used by the {@link MarketplaceExtractorFactory}.
   *
   * Implementations should also expose a `static validateUrl(url)` with the
   * same logic so the factory can route without instantiating every
   * extractor. Both forms must agree.
   */
  validateUrl(url: string): boolean;
}
