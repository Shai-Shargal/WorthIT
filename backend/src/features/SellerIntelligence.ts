/**
 * Phase 2 Feature: Seller Intelligence.
 *
 * Given a RawListing scraped from any supported marketplace, produce a
 * {@link SellerIntelligence} verdict that scores the seller's trustworthiness
 * (green / yellow / red) with a confidence value and human-readable reasoning.
 *
 * Signals, in priority order:
 *   1. MongoDB history — previous analyses of this seller (by name) stored
 *      in the `analyses` collection (Phase 1 sellerInfo block). Strongest
 *      signal: red flags previously detected against this seller.
 *   2. Fallback — yellow with low confidence when no history exists.
 *
 * NOTE: Facebook profile scraping was intentionally removed. Fetching FB
 * profiles from a backend server violates Facebook ToS and is blocked in
 * practice (bot walls). The Chrome extension content script is the canonical
 * path for any future profile-based signals — those will be passed in via
 * RawListing.seller when the extension supplies them.
 *
 * Performance:
 *   - In-memory cache (1h TTL) keyed by marketplace + seller identifier.
 *     Repeat lookups for the same seller during a session are O(1).
 *   - The cache holds the final SellerIntelligence verdict (not raw history)
 *     so the caller pays no postprocessing cost on a hit.
 */

import { AnalysisModel } from '../database/models/Analysis.js';
import { isMongoReady } from '../database/mongoose.js';
import type { RawListing } from '../marketplace/types/RawListing.js';
import type {
  SellerIntelligence,
  TrustScore,
} from './types/SellerIntelligence.js';

export type { SellerIntelligence, TrustScore } from './types/SellerIntelligence.js';

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_LIMIT = 500;
const HISTORY_LOOKUP_LIMIT = 20;

interface CachedVerdict {
  expiresAt: number;
  value: SellerIntelligence;
}

const verdictCache = new Map<string, CachedVerdict>();

/** Shape of a sellerInfo subdocument as written by Phase 1 analysisRepository. */
interface SellerHistoryDoc {
  sellerInfo?: {
    name?: string;
    rating?: number;
    ratingCount?: number;
    responseTime?: string;
    redFlags?: string[];
  };
  redFlags?: Array<{
    category?: string;
    severity?: string;
    description?: string;
  }>;
  listing?: {
    price?: number;
    currency?: string;
  };
  createdAt?: Date;
}

/**
 * Main entry point — analyze a listing's seller and return a verdict.
 * Never throws. Returns yellow with appropriate reasoning on any error.
 */
export async function extractSellerIntelligence(
  rawListing: RawListing,
): Promise<SellerIntelligence> {
  const sellerName = rawListing.seller?.name?.trim();

  if (!sellerName) {
    return {
      name: 'Unknown',
      trustScore: 'yellow',
      confidence: 0.3,
      reasoning: 'Seller information was not available on the listing.',
      historyCount: 0,
      riskFactors: [],
      sources: { fromHistory: false, fromScrape: false },
    };
  }

  // Cache key includes marketplace so same name on different platforms don't collide
  const cacheKey = buildCacheKey(sellerName, rawListing.marketplace);
  const cached = getCachedVerdict(cacheKey);
  if (cached) return cached;

  const observations = await queryHistory(sellerName);

  if (observations.length > 0) {
    const verdict = buildVerdictFromHistory(sellerName, observations);
    setCachedVerdict(cacheKey, verdict);
    return verdict;
  }

  const fallback: SellerIntelligence = {
    name: sellerName,
    trustScore: 'yellow',
    confidence: 0.4,
    reasoning:
      'No prior observations for this seller — treat as unknown.',
    historyCount: 0,
    riskFactors: [],
    sources: { fromHistory: false, fromScrape: false },
  };
  setCachedVerdict(cacheKey, fallback);
  return fallback;
}

/**
 * Query the Analyses collection for previous sellerInfo entries with the
 * given name. Returns [] on any failure — Mongo offline, query error, etc.
 */
export async function queryHistory(
  sellerName: string,
): Promise<SellerHistoryDoc[]> {
  if (!isMongoReady()) return [];
  if (!sellerName) return [];

  try {
    const docs = await AnalysisModel.find({ 'sellerInfo.name': sellerName })
      .sort({ createdAt: -1 })
      .limit(HISTORY_LOOKUP_LIMIT)
      .lean()
      .exec();
    return docs as SellerHistoryDoc[];
  } catch (err) {
    console.error(
      '[SellerIntelligence] history query failed:',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * Pure logic: derive a TrustScore from a list of prior observations.
 *
 *   Red   — any observation has a seller red flag, OR ≥ 2 high_risk red flags.
 *   Green — ≥ 2 observations, NO seller red flags, NO high_risk flags, consistent currency.
 *   Yellow — single observation, mixed signals, or only minor warnings.
 *
 * Exported for unit tests.
 */
export function calculateTrustFromHistory(
  observations: SellerHistoryDoc[],
): { trustScore: TrustScore; confidence: number; riskFactors: string[] } {
  if (observations.length === 0) {
    return { trustScore: 'yellow', confidence: 0.3, riskFactors: [] };
  }

  const riskFactors: string[] = [];
  let sellerFlagCount = 0;
  let highRiskCount = 0;
  const currencies = new Set<string>();

  for (const obs of observations) {
    if (obs.sellerInfo?.redFlags && obs.sellerInfo.redFlags.length > 0) {
      sellerFlagCount += obs.sellerInfo.redFlags.length;
      for (const flag of obs.sellerInfo.redFlags) {
        if (flag && !riskFactors.includes(flag)) riskFactors.push(flag);
      }
    }
    if (Array.isArray(obs.redFlags)) {
      for (const rf of obs.redFlags) {
        if (rf?.severity === 'high_risk') {
          highRiskCount += 1;
          const desc = rf.description ?? rf.category ?? 'high-risk flag';
          if (!riskFactors.includes(desc)) riskFactors.push(desc);
        }
      }
    }
    if (obs.listing?.currency) {
      currencies.add(obs.listing.currency.toUpperCase());
    }
  }

  if (sellerFlagCount > 0 || highRiskCount >= 2) {
    // Cap at 0.95 — avoid claiming absolute certainty from historical data alone
    const confidence = clamp(0.7 + 0.05 * Math.min(observations.length, 5), 0.7, 0.95);
    return { trustScore: 'red', confidence, riskFactors };
  }

  if (
    observations.length >= 2 &&
    sellerFlagCount === 0 &&
    highRiskCount === 0 &&
    currencies.size <= 1
  ) {
    const confidence = clamp(0.7 + 0.05 * Math.min(observations.length, 6), 0.8, 0.95);
    return { trustScore: 'green', confidence, riskFactors: [] };
  }

  const confidence = clamp(0.3 + 0.1 * Math.min(observations.length, 4), 0.3, 0.7);
  return { trustScore: 'yellow', confidence, riskFactors };
}

function buildVerdictFromHistory(
  sellerName: string,
  observations: SellerHistoryDoc[],
): SellerIntelligence {
  const { trustScore, confidence, riskFactors } =
    calculateTrustFromHistory(observations);
  return {
    name: sellerName,
    trustScore,
    confidence,
    reasoning: buildReasoning(trustScore, observations.length, riskFactors),
    historyCount: observations.length,
    riskFactors,
    sources: { fromHistory: true, fromScrape: false },
  };
}

/**
 * Compose a human-readable reasoning string for the verdict UI.
 * Exported for unit tests.
 */
export function buildReasoning(
  trustScore: TrustScore,
  historyCount: number,
  riskFactors: string[] = [],
): string {
  const n = historyCount;
  const plural = n === 1 ? '' : 's';

  if (trustScore === 'green') {
    return `Seen ${n} prior listing${plural} from this seller with no red flags — appears consistent and trustworthy.`;
  }
  if (trustScore === 'red') {
    const flags = riskFactors.slice(0, 3).join('; ');
    return `Seen ${n} prior listing${plural} from this seller with risk signals${flags ? `: ${flags}` : ''}.`;
  }
  return `Seen ${n} prior listing${plural} from this seller — insufficient signal to grade as trusted or risky.`;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function buildCacheKey(name: string, marketplace: string): string {
  return `${marketplace}:${name.toLowerCase()}`;
}

function getCachedVerdict(key: string): SellerIntelligence | null {
  const entry = verdictCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    verdictCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedVerdict(key: string, value: SellerIntelligence): void {
  if (verdictCache.size >= CACHE_LIMIT) {
    const oldest = verdictCache.keys().next().value;
    if (oldest !== undefined) verdictCache.delete(oldest);
  }
  verdictCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function __clearSellerIntelligenceCacheForTests(): void {
  verdictCache.clear();
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
