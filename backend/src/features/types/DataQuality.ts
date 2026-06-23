/**
 * Data quality metrics for an enriched listing.
 *
 * Produced by the Data Enrichment Orchestrator after gathering data from
 * five sources (product, seller, market, competition, trends). These
 * metrics let consumers — most importantly the AI Verdict Engine — decide
 * how much to trust the verdict it produces.
 *
 * Honesty over optimism: if only two of five sources succeeded, the
 * orchestrator MUST report that here rather than silently degrading the
 * confidence number on its own.
 */

/**
 * Which of the five data sources successfully returned data.
 *
 * A `false` here means the source either threw, timed out, or returned a
 * null/empty payload. The reason is recorded in {@link DataQuality.failureReasons}.
 */
export interface DataSourceAvailability {
  product: boolean;
  seller: boolean;
  market: boolean;
  competition: boolean;
  trends: boolean;
}

/**
 * Aggregate quality summary for a RichListing.
 *
 * - `completeness` is the fraction of sources that succeeded (0–1).
 * - `confidenceOverall` is the weighted average of source-level confidences,
 *   scaled by `completeness` and capped when too many sources failed.
 * - `totalDataPoints` is a rough field-count signal used as a sanity check.
 * - `sources` is the per-source success map.
 * - `failureReasons` carries human-readable causes (e.g. `seller: timeout`).
 */
export interface DataQuality {
  completeness: number;
  confidenceOverall: number;
  totalDataPoints: number;
  sources: DataSourceAvailability;
  failureReasons: string[];
}
