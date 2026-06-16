import type {
  ConfidenceLevel,
  ListingSnapshot,
  LocalMarketContext,
  Verdict,
  VerdictResult,
} from '../../../shared/types/index.js';

export interface VerdictInput {
  listing: ListingSnapshot;
  localMarketContext: LocalMarketContext;
}

function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.65) return 'high';
  if (score >= 0.35) return 'medium';
  return 'low';
}

function worthRatingFromRatio(ratio: number): number {
  if (ratio <= 0.75) return 5;
  if (ratio <= 0.9) return 4;
  if (ratio <= 1.1) return 3;
  if (ratio <= 1.25) return 2;
  return 1;
}

/** Deterministic verdict — never calls the LLM. */
export function computeVerdict(input: VerdictInput): VerdictResult {
  const { listing, localMarketContext } = input;
  const typical = localMarketContext.typicalPrice;
  const observationCount = localMarketContext.observationCount;

  let verdict: Verdict = 'maybe';
  let confidence = Math.min(0.4, 0.05 + observationCount * 0.05);

  if (typical && observationCount > 0) {
    const ratio = listing.price / typical.p50;
    verdict =
      ratio <= 0.8 ? 'worth_it' : ratio >= 1.2 ? 'avoid' : 'maybe';
    confidence = Math.min(
      0.85,
      0.25 + observationCount * 0.08 + (verdict === 'maybe' ? 0 : 0.1),
    );
  }

  const qualityCap =
    localMarketContext.dataQuality === 'seed' ? 0.30 :
    localMarketContext.dataQuality === 'insufficient' ? 0.50 :
    0.85;

  confidence = Math.min(confidence, qualityCap);

  const worthRating =
    typical && observationCount > 0
      ? worthRatingFromRatio(listing.price / typical.p50)
      : 3;

  return {
    verdict,
    worthRating,
    confidence,
    confidenceLevel: confidenceLevel(confidence),
    estimatedValue:
      localMarketContext.priceRange && observationCount >= 3
        ? {
            min: localMarketContext.priceRange.min,
            max: localMarketContext.priceRange.max,
            currency: localMarketContext.currency,
          }
        : undefined,
  };
}
