import type { IMarketplaceExtractor } from './IMarketplaceExtractor.js';
import { FacebookExtractor } from './providers/facebook.js';
import { Yad2Extractor } from './providers/yad2.js';

/**
 * Routes a marketplace listing URL to the concrete
 * {@link IMarketplaceExtractor} that knows how to parse it.
 *
 * Adding a new marketplace is a two-line change:
 *   1. Implement a new class against {@link IMarketplaceExtractor} with a
 *      `static validateUrl(url)` matching the instance method.
 *   2. Add one `if (NewExtractor.validateUrl(url)) return new NewExtractor();`
 *      line to {@link MarketplaceExtractorFactory.getExtractor}.
 *
 * Kept intentionally simple — no registration map, no dynamic loading — so
 * the routing path is trivial to read and impossible to misconfigure. If we
 * ever exceed ~6 extractors we can graduate to a registry pattern.
 */
export class MarketplaceExtractorFactory {
  /**
   * Return a fresh extractor instance for `url`, or throw if no registered
   * marketplace recognizes it.
   *
   * Validators are pure URL checks — they never throw and never perform
   * I/O — so the first match wins and order does not matter for
   * disambiguation between non-overlapping hostnames.
   */
  static getExtractor(url: string): IMarketplaceExtractor {
    if (FacebookExtractor.validateUrl(url)) return new FacebookExtractor();
    if (Yad2Extractor.validateUrl(url)) return new Yad2Extractor();
    throw new Error(`Unsupported marketplace URL: ${url}`);
  }
}
