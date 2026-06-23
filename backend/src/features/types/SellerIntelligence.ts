/**
 * Phase 2 Feature: Seller Intelligence type.
 *
 * Output of {@link extractSellerIntelligence} (see ../SellerIntelligence.ts).
 * Consumed by the verdict aggregator (Task 9) along with the three other
 * intelligence features (price, listing, market).
 *
 * The trustScore is a small enum, not a number, so the verdict aggregator can
 * reason about it categorically without rebucketing.
 */
export type TrustScore = 'green' | 'yellow' | 'red';

export type SellerIntelligence = {
  /** Seller name (or "Unknown" when seller info was missing entirely). */
  name: string;
  /** green = trusted, yellow = unknown / insufficient data, red = risky. */
  trustScore: TrustScore;
  /** Confidence in the trust score, 0–1. */
  confidence: number;
  /** Human-readable explanation surfaced in the verdict UI. */
  reasoning: string;
  /** Number of previous observations used to derive the score. */
  historyCount: number;
  /** When trustScore is 'red' (or partial red signal), specific reasons. */
  riskFactors: string[];
  /** Which data source contributed signal (both can be true). */
  sources: {
    fromHistory: boolean;
    fromScrape: boolean;
  };
};
