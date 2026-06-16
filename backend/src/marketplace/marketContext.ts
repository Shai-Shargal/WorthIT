import type {
  HistoricalContext,
  LocalMarketContext,
  MarketObservation,
} from '../../../shared/types/index.js';
import { findSimilarObservations } from './marketObservations.js';
import { getSeedObservations } from './seed.js';
import { describePrices, removeOutliers } from './statistics.js';

export interface MarketContextQuery {
  name: string;
  currency: string;
}

export interface MarketContexts {
  localMarketContext: LocalMarketContext;
  historicalContext: HistoricalContext;
}

const RECENT_WINDOW_DAYS = 90;
const RECENT_OBSERVATION_LIMIT = 30;
const HISTORICAL_OBSERVATION_LIMIT = 50;
const LOW_OBSERVATION_THRESHOLD = 4;

function round(value: number): number {
  return Math.round(value);
}

function buildLocalContext(
  query: MarketContextQuery,
  observations: MarketObservation[],
  notes: string[],
  dataQuality: 'real' | 'seed' | 'insufficient',
): LocalMarketContext {
  const prices = observations
    .map((obs) => obs.observedPrice)
    .filter((p) => Number.isFinite(p) && p > 0);

  const cleaned = removeOutliers(prices);
  const usable = cleaned.length > 0 ? cleaned : prices;
  const distribution = describePrices(usable);

  if (observations.length < LOW_OBSERVATION_THRESHOLD) {
    notes.push(
      `Only ${observations.length} recent Israeli-market observation${observations.length === 1 ? '' : 's'} found; confidence is limited.`,
    );
  }

  return {
    query: query.name,
    currency: query.currency,
    observationCount: observations.length,
    dataQuality,
    priceRange: distribution
      ? { min: round(distribution.min), max: round(distribution.max) }
      : undefined,
    typicalPrice: distribution
      ? {
          p25: round(distribution.p25),
          p50: round(distribution.p50),
          p75: round(distribution.p75),
        }
      : undefined,
    recentObservations: observations.slice(0, RECENT_OBSERVATION_LIMIT),
    notes,
  };
}

function buildHistoricalContext(
  query: MarketContextQuery,
  observations: MarketObservation[],
): HistoricalContext {
  if (observations.length === 0) {
    return {
      query: query.name,
      totalObservations: 0,
      observations: [],
    };
  }

  let oldest = observations[0].timestamp;
  let newest = observations[0].timestamp;
  for (const obs of observations) {
    if (obs.timestamp < oldest) oldest = obs.timestamp;
    if (obs.timestamp > newest) newest = obs.timestamp;
  }

  return {
    query: query.name,
    totalObservations: observations.length,
    oldestTimestamp: oldest,
    newestTimestamp: newest,
    observations: observations.slice(0, HISTORICAL_OBSERVATION_LIMIT),
  };
}

export async function buildMarketContexts(query: MarketContextQuery): Promise<MarketContexts> {
  const currency = query.currency.trim().toUpperCase() || 'USD';
  const normalized: MarketContextQuery = { name: query.name, currency };
  const notes: string[] = [];

  const [recentStored, olderStored] = await Promise.all([
    findSimilarObservations({
      name: normalized.name,
      currency,
      sinceDays: RECENT_WINDOW_DAYS,
      limit: RECENT_OBSERVATION_LIMIT,
    }),
    findSimilarObservations({
      name: normalized.name,
      currency,
      olderThanDays: RECENT_WINDOW_DAYS,
      limit: HISTORICAL_OBSERVATION_LIMIT,
    }),
  ]);

  let recent = recentStored;
  let usedSeed = false;

  if (recent.length === 0) {
    const seed = await getSeedObservations({ name: normalized.name, currency }).catch((err) => {
      console.error('[marketContext] seed provider failed:', err instanceof Error ? err.message : err);
      return [] as MarketObservation[];
    });
    if (seed.length > 0) {
      recent = seed;
      usedSeed = true;
      notes.push(
        'No live Israeli-market observations stored yet; falling back to synthetic seed data.',
      );
    }
  }

  const dataQuality: 'real' | 'seed' | 'insufficient' =
    usedSeed ? 'seed' :
    recentStored.length < 5 ? 'insufficient' :
    'real';

  const localMarketContext = buildLocalContext(normalized, recent, notes, dataQuality);
  const historicalContext = buildHistoricalContext(normalized, olderStored);

  return { localMarketContext, historicalContext };
}
