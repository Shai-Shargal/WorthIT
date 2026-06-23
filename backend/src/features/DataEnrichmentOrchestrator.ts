/**
 * Data Enrichment Orchestrator (Phase 2 — Task 6).
 *
 * Coordinates parallel data gathering from five independent sources and
 * combines their results into a single {@link RichListing} for the AI
 * Verdict Engine.
 *
 * Design goals (in priority order):
 *   1. Quality over speed — never invent data; report what we have.
 *   2. Graceful degradation — one failing source must not crash the others.
 *   3. Predictable latency — every source has a hard timeout.
 *   4. Idempotent caching — same input within 1h returns cached result.
 *
 * Implementation notes:
 *   - Uses `Promise.allSettled` (not `Promise.all`) so a rejection from any
 *     single source is captured and translated into a `null` slot rather
 *     than propagating.
 *   - Each source call is wrapped with {@link withTimeout} so that a slow
 *     network/IO call cannot exceed its budget.
 *   - The five data-source functions are passed in as dependencies
 *     ({@link DataSources}) so Tasks 7–11 can swap their real
 *     implementations in without touching the orchestrator.
 *   - Module-level cache is intentionally simple (Map + TTL + LRU-ish
 *     eviction). When usage volume warrants it we can migrate to Redis
 *     without changing the public API.
 */

import type { RawListing } from '../marketplace/types/RawListing.js';
import type {
  AggregatedRedFlags,
  CompetitionData,
  MarketData,
  ProductData,
  RichListing,
  SellerData,
  TrendData,
} from './types/RichListing.js';
import type { DataQuality, DataSourceAvailability } from './types/DataQuality.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Per-source timeout budgets (ms). Tuned so the sum of the slowest path
 * (competition: 1200ms) sits comfortably under the orchestrator's 2s
 * end-to-end target, and the parallel envelope stays well below 2s.
 */
export const SOURCE_TIMEOUTS_MS = {
  product: 500,
  seller: 1000,
  market: 800,
  competition: 1200,
  trends: 700,
} as const;

/**
 * Confidence weighting. Sums to 1.0. Market context dominates because for
 * a "worth it / not worth it" verdict, comparable prices are the strongest
 * signal. Seller history is next-most important (trust matters). Trends
 * and competition are auxiliary signals.
 */
export const CONFIDENCE_WEIGHTS = {
  product: 0.15,
  seller: 0.25,
  market: 0.35,
  competition: 0.15,
  trends: 0.10,
} as const;

/** Cache TTL — data drifts slowly; 1h is a reasonable upper bound. */
export const CACHE_TTL_MS = 60 * 60 * 1000;

/** Max cached entries before we start evicting the oldest insertion. */
export const CACHE_MAX_ENTRIES = 1000;

// ---------------------------------------------------------------------------
// Data-source dependency injection
// ---------------------------------------------------------------------------

/**
 * Shape of an injectable data-source bundle. Each function takes the raw
 * listing and resolves with the source-specific payload (or rejects with
 * a meaningful error message that the orchestrator will record).
 *
 * Tasks 7–11 will provide real implementations; the orchestrator ships
 * with default mocks (see {@link createMockDataSources}) so the rest of
 * the verdict pipeline can be built and tested independently.
 */
export interface DataSources {
  enhanceProduct: (raw: RawListing) => Promise<ProductData>;
  enrichSeller: (raw: RawListing) => Promise<SellerData>;
  gatherMarket: (raw: RawListing) => Promise<MarketData>;
  analyzeCompetition: (raw: RawListing) => Promise<CompetitionData>;
  analyzeTrends: (raw: RawListing) => Promise<TrendData>;
}

/**
 * Default mock data sources. Returns plausible but clearly-synthetic
 * payloads so the orchestrator and downstream tests work end-to-end
 * before Tasks 7–11 land. Replace by passing a real {@link DataSources}
 * bundle to {@link enrichListing}.
 */
export function createMockDataSources(): DataSources {
  return {
    enhanceProduct: async (raw) => ({
      title: raw.title,
      price: raw.price,
      currency: raw.currency,
      condition: '',
      category: '',
      description: raw.description ?? '',
      images: raw.images,
      postedDate: raw.postedDate,
      url: raw.url,
      marketplace: raw.marketplace,
      redFlags: [],
      confidence: 0.95,
    }),
    enrichSeller: async (raw) => ({
      name: raw.seller?.name ?? 'Unknown',
      trustScore: 72,
      historicalListings: 0,
      redFlags: [],
      confidence: 0.6,
    }),
    gatherMarket: async (_raw) => ({
      sampleSize: 0,
      redFlags: [],
      confidence: 0.5,
    }),
    analyzeCompetition: async (_raw) => ({
      crossMarketplaceListings: [],
      arbitrageOpportunity: { detected: false },
      redFlags: [],
      confidence: 0.5,
    }),
    analyzeTrends: async (_raw) => ({
      seasonal: { isSeasonal: false },
      redFlags: [],
      confidence: 0.5,
    }),
  };
}

// ---------------------------------------------------------------------------
// Cache (module-level, with TTL + insertion-order eviction)
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: RichListing;
  timestamp: number;
}

const enrichmentCache = new Map<string, CacheEntry>();

/**
 * Build a stable cache key. We key on marketplace plus the most specific
 * identifier we have — the listing URL — falling back to seller name when
 * URL is missing. Caching is per-listing, not per-seller, because two
 * different listings from the same seller still need independent enrichment.
 */
function getCacheKey(raw: RawListing): string {
  const identifier = raw.url || raw.seller?.name || raw.title;
  return `${raw.marketplace}:${identifier}`;
}

function isCacheValid(entry: CacheEntry, now: number): boolean {
  return now - entry.timestamp < CACHE_TTL_MS;
}

function evictIfFull(): void {
  if (enrichmentCache.size < CACHE_MAX_ENTRIES) return;
  // Map preserves insertion order — drop the oldest.
  const oldestKey = enrichmentCache.keys().next().value;
  if (oldestKey !== undefined) enrichmentCache.delete(oldestKey);
}

/** Test-only: clear the in-memory cache between tests. */
export function __resetOrchestratorCacheForTests(): void {
  enrichmentCache.clear();
}

/** Inspect-only: returns current cache size. Useful for assertions. */
export function __orchestratorCacheSizeForTests(): number {
  return enrichmentCache.size;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Race a promise against a timeout. If the timeout fires first the
 * returned promise rejects with `Error('timeout')` — the orchestrator
 * inspects the message to format failure reasons.
 *
 * Note: this does NOT cancel the underlying work (JS promises are not
 * cancellable). The original promise continues to run but its result
 * is ignored. That's acceptable here because all data-source calls are
 * idempotent reads.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: timeout`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/** Pull a result out of an `allSettled` outcome, or `null` on rejection. */
function takeFulfilled<T>(
  outcome: PromiseSettledResult<T>,
  label: string,
  failureReasons: string[],
): T | null {
  if (outcome.status === 'fulfilled') return outcome.value;
  const reason =
    outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
  failureReasons.push(reason.startsWith(label) ? reason : `${label}: ${reason}`);
  return null;
}

/**
 * Count populated fields on a source payload — used by
 * {@link calculateDataQuality} as a "richness" signal independent of
 * the boolean availability map. Counts only truthy non-empty values.
 */
function countDataPoints(obj: unknown): number {
  if (!obj || typeof obj !== 'object') return 0;
  let n = 0;
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Combination + scoring
// ---------------------------------------------------------------------------

interface SourceResults {
  product: ProductData | null;
  seller: SellerData | null;
  market: MarketData | null;
  competition: CompetitionData | null;
  trends: TrendData | null;
}

/**
 * Merge red-flag arrays from each source into the aggregated bucket layout
 * the verdict engine expects. Sources that failed contribute empty arrays.
 */
function combineRedFlags(sources: SourceResults): AggregatedRedFlags {
  return {
    listing: sources.product?.redFlags ?? [],
    seller: sources.seller?.redFlags ?? [],
    market: sources.market?.redFlags ?? [],
    competition: sources.competition?.redFlags ?? [],
    trends: sources.trends?.redFlags ?? [],
    fraud: [], // Reserved for the verdict engine.
  };
}

/**
 * Compute the data-quality block. `completeness` is the fraction of
 * sources that succeeded (so 3/5 → 0.6). `confidenceOverall` is left to
 * {@link calculateConfidence} — we just record availability here.
 */
export function calculateDataQuality(
  sources: SourceResults,
  failureReasons: string[],
): DataQuality {
  const availability: DataSourceAvailability = {
    product: sources.product !== null,
    seller: sources.seller !== null,
    market: sources.market !== null,
    competition: sources.competition !== null,
    trends: sources.trends !== null,
  };
  const successes = Object.values(availability).filter(Boolean).length;
  const completeness = successes / 5;

  const totalDataPoints =
    countDataPoints(sources.product) +
    countDataPoints(sources.seller) +
    countDataPoints(sources.market) +
    countDataPoints(sources.competition) +
    countDataPoints(sources.trends);

  return {
    completeness,
    confidenceOverall: 0, // Filled in by calculateConfidence.
    totalDataPoints,
    sources: availability,
    failureReasons,
  };
}

/**
 * Weighted-average confidence across the five sources, then scaled down
 * by completeness so that "lots of data, all weak" and "little data, all
 * strong" both end up at honest middle values.
 *
 * Then we cap the result by completeness band:
 *   - < 30% sources available → cap at 0.40
 *   - < 60% sources available → cap at 0.65
 *   - otherwise → no cap
 *
 * Failed sources contribute 0 to the weighted sum (NOT their default 0.5
 * fallback) so a missing source genuinely hurts confidence.
 */
export function calculateConfidence(
  sources: SourceResults,
  completeness: number,
): number {
  const weighted =
    (sources.product?.confidence ?? 0) * CONFIDENCE_WEIGHTS.product +
    (sources.seller?.confidence ?? 0) * CONFIDENCE_WEIGHTS.seller +
    (sources.market?.confidence ?? 0) * CONFIDENCE_WEIGHTS.market +
    (sources.competition?.confidence ?? 0) * CONFIDENCE_WEIGHTS.competition +
    (sources.trends?.confidence ?? 0) * CONFIDENCE_WEIGHTS.trends;

  let confidence = weighted * completeness;

  if (completeness < 0.3) confidence = Math.min(confidence, 0.4);
  else if (completeness < 0.6) confidence = Math.min(confidence, 0.65);

  // Clamp to [0, 1] for safety.
  if (confidence < 0) confidence = 0;
  if (confidence > 1) confidence = 1;
  return confidence;
}

/**
 * Build the final {@link RichListing} from the five source outcomes plus
 * the raw listing fallback for the product slot.
 *
 * Why the product fallback: the orchestrator's contract is that `product`
 * is non-null. If the product enhancer (Task 7) fails, we synthesize a
 * minimal ProductData from the RawListing so downstream consumers never
 * see `product: null`. Its `confidence` reflects that it came from the
 * extractor only.
 */
function combineData(raw: RawListing, sources: SourceResults, dataQuality: DataQuality): RichListing {
  const product: ProductData = sources.product ?? {
    title: raw.title,
    price: raw.price,
    currency: raw.currency,
    condition: '',
    category: '',
    description: raw.description ?? '',
    images: raw.images,
    postedDate: raw.postedDate,
    url: raw.url,
    marketplace: raw.marketplace,
    redFlags: [],
    confidence: 0.5,
  };

  const confidenceOverall = calculateConfidence(sources, dataQuality.completeness);

  return {
    product,
    seller: sources.seller,
    market: sources.market,
    competition: sources.competition,
    trends: sources.trends,
    redFlags: combineRedFlags(sources),
    dataQuality: { ...dataQuality, confidenceOverall },
    confidenceOverall,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EnrichOptions {
  /**
   * Override the default mock data sources. Tasks 7–11 will pass their
   * real implementations here; tests pass deterministic stubs.
   */
  dataSources?: DataSources;
  /**
   * Skip cache lookup/store. Useful for tests and for callers who know
   * they need fresh data (e.g. after a user edits the listing URL).
   */
  bypassCache?: boolean;
  /** Override per-source timeouts (ms). Primarily for testing slow paths. */
  timeouts?: Partial<typeof SOURCE_TIMEOUTS_MS>;
}

/**
 * Orchestrator entry point. Returns a fully assembled {@link RichListing}.
 *
 * Will never throw for source-level failures — those are recorded in
 * `dataQuality.failureReasons` and reflected by `null` slots and a lower
 * `confidenceOverall`. Only programmer errors (bad input, bugs) escape.
 */
export async function enrichListing(
  raw: RawListing,
  options: EnrichOptions = {},
): Promise<RichListing> {
  const sources = options.dataSources ?? createMockDataSources();
  const timeouts = { ...SOURCE_TIMEOUTS_MS, ...options.timeouts };

  // ---- Cache lookup ----------------------------------------------------
  const cacheKey = getCacheKey(raw);
  const now = Date.now();
  if (!options.bypassCache) {
    const cached = enrichmentCache.get(cacheKey);
    if (cached && isCacheValid(cached, now)) {
      return cached.data;
    }
    // Expired — drop it.
    if (cached) enrichmentCache.delete(cacheKey);
  }

  // ---- Parallel data gathering ----------------------------------------
  const settled = await Promise.allSettled([
    withTimeout(sources.enhanceProduct(raw), timeouts.product, 'product'),
    withTimeout(sources.enrichSeller(raw), timeouts.seller, 'seller'),
    withTimeout(sources.gatherMarket(raw), timeouts.market, 'market'),
    withTimeout(sources.analyzeCompetition(raw), timeouts.competition, 'competition'),
    withTimeout(sources.analyzeTrends(raw), timeouts.trends, 'trends'),
  ]);

  const failureReasons: string[] = [];
  const results: SourceResults = {
    product: takeFulfilled(settled[0], 'product', failureReasons),
    seller: takeFulfilled(settled[1], 'seller', failureReasons),
    market: takeFulfilled(settled[2], 'market', failureReasons),
    competition: takeFulfilled(settled[3], 'competition', failureReasons),
    trends: takeFulfilled(settled[4], 'trends', failureReasons),
  };

  // ---- Combine + score ------------------------------------------------
  const dataQuality = calculateDataQuality(results, failureReasons);
  const rich = combineData(raw, results, dataQuality);

  // ---- Cache store -----------------------------------------------------
  if (!options.bypassCache) {
    evictIfFull();
    enrichmentCache.set(cacheKey, { data: rich, timestamp: now });
  }

  return rich;
}
