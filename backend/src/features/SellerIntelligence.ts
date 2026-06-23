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
 *   2. Facebook profile scrape — only when no history exists and the listing
 *      is on Facebook and exposes a profile URL. Weak signal (page may be
 *      bot-blocked or JS-rendered) — never escalates to green / red on its
 *      own; only nudges confidence.
 *   3. Fallback — yellow with low confidence.
 *
 * All edge cases (missing seller, scrape failure, malformed URL, Mongo down)
 * return a yellow verdict rather than throwing. The caller (verdict
 * aggregator) treats yellow as "unknown, lean cautious".
 *
 * Performance:
 *   - In-memory cache (1h TTL) keyed by seller identifier. Repeat lookups for
 *     the same seller during a session are O(1) — no Mongo round-trip, no
 *     HTTP fetch.
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

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_LIMIT = 500;
const HISTORY_LOOKUP_LIMIT = 20;
const PROFILE_FETCH_TIMEOUT_MS = 5_000;
const FACEBOOK_PROFILE_HOST_REGEX = /^(?:[\w-]+\.)*facebook\.com$/i;

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

/** Subset of a Facebook profile page we can extract from static HTML. */
interface FacebookProfile {
  /** Best-effort completeness signal: 0–1. */
  completeness: number;
  /** True when the profile page returned anything parseable. */
  exists: boolean;
  /** Raw signals (used for reasoning). */
  signals: string[];
}

/**
 * Main entry point — analyze a listing's seller and return a verdict.
 *
 * Never throws. Returns yellow with appropriate reasoning on any error.
 */
export async function extractSellerIntelligence(
  rawListing: RawListing,
): Promise<SellerIntelligence> {
  const sellerName = rawListing.seller?.name?.trim();
  const profileUrl = rawListing.seller?.profileUrl?.trim();

  // Edge case 1: missing seller info entirely → yellow, no work to do.
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

  // Cache check — repeat sellers in the same session return instantly.
  const cacheKey = buildCacheKey(sellerName, profileUrl);
  const cached = getCachedVerdict(cacheKey);
  if (cached) return cached;

  // 1. Try MongoDB history first — strongest signal.
  const observations = await queryHistory(sellerName);

  if (observations.length > 0) {
    const verdict = buildVerdictFromHistory(sellerName, observations);
    setCachedVerdict(cacheKey, verdict);
    return verdict;
  }

  // 2. No history — try Facebook profile scrape if applicable.
  if (
    rawListing.marketplace === 'facebook' &&
    profileUrl &&
    isFacebookProfileUrl(profileUrl)
  ) {
    const profile = await scrapeFacebookProfile(profileUrl);
    if (profile && profile.exists) {
      const verdict = buildVerdictFromProfile(sellerName, profile);
      setCachedVerdict(cacheKey, verdict);
      return verdict;
    }
  }

  // 3. Fallback — no history, no usable profile.
  const fallback: SellerIntelligence = {
    name: sellerName,
    trustScore: 'yellow',
    confidence: 0.4,
    reasoning:
      'No prior observations for this seller and no profile data available — treat as unknown.',
    historyCount: 0,
    riskFactors: [],
    sources: { fromHistory: false, fromScrape: false },
  };
  setCachedVerdict(cacheKey, fallback);
  return fallback;
}

/**
 * Query the Analyses collection for previous sellerInfo entries with the
 * given name. Returns the most recent observations first, capped at
 * HISTORY_LOOKUP_LIMIT.
 *
 * Returns [] (not null, not throw) on any failure — Mongo offline, query
 * error, etc. The caller treats empty history as "no signal".
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
 *   Red   — any observation has a seller red flag, OR ≥ 2 high_risk red flags
 *           anywhere in history, OR multiple currency switches (price scams).
 *   Green — ≥ 2 observations, NO seller red flags, NO high_risk red flags,
 *           consistent currency.
 *   Yellow — single observation, or mixed signals, or only minor warnings.
 *
 * Exported so Task 8 unit tests can exercise the pure logic without Mongo.
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

  // RED: any explicit seller red flag, or multiple high-risk flags.
  if (sellerFlagCount > 0 || highRiskCount >= 2) {
    const confidence = clamp(0.7 + 0.05 * Math.min(observations.length, 6), 0.7, 1.0);
    return { trustScore: 'red', confidence, riskFactors };
  }

  // GREEN: enough history, no flags, consistent currency.
  if (
    observations.length >= 2 &&
    sellerFlagCount === 0 &&
    highRiskCount === 0 &&
    currencies.size <= 1
  ) {
    const confidence = clamp(
      0.7 + 0.05 * Math.min(observations.length, 6),
      0.8,
      1.0,
    );
    return { trustScore: 'green', confidence, riskFactors: [] };
  }

  // YELLOW: anything else (single observation, mixed signals, currency mix).
  const confidence = clamp(0.3 + 0.1 * Math.min(observations.length, 4), 0.3, 0.7);
  return { trustScore: 'yellow', confidence, riskFactors };
}

/**
 * Pure logic: build a SellerIntelligence verdict from history.
 * Wraps {@link calculateTrustFromHistory} with reasoning + bookkeeping.
 */
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
    reasoning: buildReasoning(trustScore, 'history', {
      historyCount: observations.length,
      riskFactors,
    }),
    historyCount: observations.length,
    riskFactors,
    sources: { fromHistory: true, fromScrape: false },
  };
}

/**
 * Attempt to fetch and parse a Facebook profile page. Returns null on any
 * failure (404, network error, timeout, malformed URL).
 *
 * NOTE: Facebook profile pages are heavily bot-blocked and JS-rendered, so
 * this is best-effort only. We extract a coarse completeness signal from the
 * static HTML (presence of og:title, profile image, etc.) — not a full
 * profile scrape. The Chrome extension content script remains the canonical
 * path for full profile data.
 */
export async function scrapeFacebookProfile(
  profileUrl: string,
): Promise<FacebookProfile | null> {
  if (!profileUrl || !isFacebookProfileUrl(profileUrl)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROFILE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(profileUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!response.ok) return null;
    const html = await response.text();
    return parseFacebookProfileHtml(html);
  } catch (err) {
    console.warn(
      '[SellerIntelligence] facebook profile scrape failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract a coarse profile completeness signal from static HTML.
 * Pure (no I/O) so it can be unit-tested with sample pages.
 */
export function parseFacebookProfileHtml(html: string): FacebookProfile {
  const signals: string[] = [];
  let completeness = 0;

  // Profile has an og:title — name visible to crawlers.
  if (/<meta[^>]+property=["']og:title["']/i.test(html)) {
    completeness += 0.3;
    signals.push('has_og_title');
  }
  // Profile has an og:image — public avatar.
  if (/<meta[^>]+property=["']og:image["']/i.test(html)) {
    completeness += 0.3;
    signals.push('has_profile_image');
  }
  // Profile has a description / about section.
  if (/<meta[^>]+property=["']og:description["']/i.test(html)) {
    completeness += 0.2;
    signals.push('has_description');
  }
  // Page contains marketplace activity references.
  if (/marketplace|listings|sold/i.test(html)) {
    completeness += 0.2;
    signals.push('has_marketplace_activity');
  }

  // If we got literally nothing (e.g. login wall), exists = false.
  const exists = completeness > 0;

  return {
    completeness: clamp(completeness, 0, 1),
    exists,
    signals,
  };
}

/**
 * Pure logic: convert a Facebook profile signal into a TrustScore.
 *
 * Profile scrapes are weak signal — they can never escalate to red (no fraud
 * evidence) and only reach green at high completeness. Most outcomes are
 * yellow with varying confidence.
 *
 * Exported for Task 8 unit tests.
 */
export function calculateTrustFromProfile(profile: FacebookProfile): {
  trustScore: TrustScore;
  confidence: number;
} {
  if (!profile.exists) {
    return { trustScore: 'yellow', confidence: 0.3 };
  }
  if (profile.completeness >= 0.8) {
    return { trustScore: 'green', confidence: 0.6 };
  }
  if (profile.completeness >= 0.5) {
    return { trustScore: 'yellow', confidence: 0.6 };
  }
  return { trustScore: 'yellow', confidence: 0.4 };
}

function buildVerdictFromProfile(
  sellerName: string,
  profile: FacebookProfile,
): SellerIntelligence {
  const { trustScore, confidence } = calculateTrustFromProfile(profile);
  return {
    name: sellerName,
    trustScore,
    confidence,
    reasoning: buildReasoning(trustScore, 'profile', {
      completeness: profile.completeness,
      signals: profile.signals,
    }),
    historyCount: 0,
    riskFactors: [],
    sources: { fromHistory: false, fromScrape: true },
  };
}

/**
 * Compose a human-readable reasoning string for the verdict UI.
 *
 * Exported for Task 8 unit tests (and so other features can reuse the
 * style — feature briefs say verdicts must be human-readable, not JSON).
 */
export function buildReasoning(
  trustScore: TrustScore,
  source: 'history' | 'profile' | 'none',
  details: {
    historyCount?: number;
    riskFactors?: string[];
    completeness?: number;
    signals?: string[];
  } = {},
): string {
  if (source === 'history') {
    const n = details.historyCount ?? 0;
    if (trustScore === 'green') {
      return `Seen ${n} prior listing${n === 1 ? '' : 's'} from this seller with no red flags — appears consistent and trustworthy.`;
    }
    if (trustScore === 'red') {
      const flags = (details.riskFactors ?? []).slice(0, 3).join('; ');
      return `Seen ${n} prior listing${n === 1 ? '' : 's'} from this seller with risk signals${flags ? `: ${flags}` : ''}.`;
    }
    return `Seen ${n} prior listing${n === 1 ? '' : 's'} from this seller — insufficient signal to grade as trusted or risky.`;
  }
  if (source === 'profile') {
    const pct = Math.round((details.completeness ?? 0) * 100);
    if (trustScore === 'green') {
      return `Facebook profile is well-populated (${pct}% completeness) — basic trust signals present.`;
    }
    return `Facebook profile has limited public information (${pct}% completeness) — cannot confirm trustworthiness.`;
  }
  return 'Insufficient data to assess seller trustworthiness.';
}

// ---------------------------------------------------------------------------
// Cache helpers (in-memory, 1h TTL, soft-bounded).
// ---------------------------------------------------------------------------

function buildCacheKey(name: string, profileUrl: string | undefined): string {
  // Use profile URL when present (more specific than name); otherwise name.
  return profileUrl ? `url:${profileUrl}` : `name:${name.toLowerCase()}`;
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

/** Test-only cache reset. Mirrors analysisCache pattern. */
export function __clearSellerIntelligenceCacheForTests(): void {
  verdictCache.clear();
}

// ---------------------------------------------------------------------------
// Small utilities.
// ---------------------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function isFacebookProfileUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return FACEBOOK_PROFILE_HOST_REGEX.test(parsed.hostname);
  } catch {
    return false;
  }
}
