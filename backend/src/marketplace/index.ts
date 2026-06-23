// Phase 1 market-data exports (must remain stable — analysis.route + run.ts depend on these).
export { findSimilarObservations, recordObservations } from './marketObservations.js';
export type { MarketDataQuery } from './providers/types.js';

// Phase 2 marketplace-abstraction exports — adopted by feature engine + POST /analyze.
export type {
  IMarketplaceExtractor,
} from './IMarketplaceExtractor.js';
export type {
  Marketplace,
  RawListing,
  RawSeller,
} from './types/RawListing.js';
export { MarketplaceExtractorFactory } from './MarketplaceExtractorFactory.js';
export { FacebookExtractor } from './providers/facebook/index.js';
export { Yad2Extractor } from './providers/yad2/index.js';
