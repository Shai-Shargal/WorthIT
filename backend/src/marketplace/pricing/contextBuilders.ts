import type {
  HistoricalContext,
  LocalMarketContext,
  MarketObservation,
} from '../../../../shared/types/index.js';
import { describePrices, removeOutliers } from '../statistics.js';

const RECENT_LIMIT = 30;
const HISTORICAL_LIMIT = 50;
const TAVILY_THRESHOLD = 5;

export type PriceDataQualityLevel = 'real' | 'seed' | 'limited' | 'insufficient';

function round(n: number): number {
  return Math.round(n);
}

export function buildDataQuality(dbCount: number, tavilyCount: number): PriceDataQualityLevel {
  if (dbCount >= TAVILY_THRESHOLD) return 'real';
  if (dbCount === 0 && tavilyCount === 0) return 'insufficient';
  if (dbCount === 0 && tavilyCount > 0) return 'seed';
  return 'limited';
}

export function buildLocalContext(
  query: string,
  currency: string,
  observations: MarketObservation[],
  dataQuality: PriceDataQualityLevel,
  notes: string[],
): LocalMarketContext {
  const prices = observations
    .map((o) => o.observedPrice)
    .filter((p) => Number.isFinite(p) && p > 0);
  const cleaned = removeOutliers(prices);
  const usable = cleaned.length > 0 ? cleaned : prices;
  const dist = describePrices(usable);

  return {
    query,
    currency,
    observationCount: observations.length,
    dataQuality,
    priceRange: dist ? { min: round(dist.min), max: round(dist.max) } : undefined,
    typicalPrice: dist
      ? { p25: round(dist.p25), p50: round(dist.p50), p75: round(dist.p75) }
      : undefined,
    recentObservations: observations.slice(0, RECENT_LIMIT),
    notes,
  };
}

export function buildHistoricalContext(
  query: string,
  observations: MarketObservation[],
): HistoricalContext {
  if (observations.length === 0) {
    return { query, totalObservations: 0, observations: [] };
  }
  let oldest = observations[0].timestamp;
  let newest = observations[0].timestamp;
  for (const o of observations) {
    if (o.timestamp < oldest) oldest = o.timestamp;
    if (o.timestamp > newest) newest = o.timestamp;
  }
  return {
    query,
    totalObservations: observations.length,
    oldestTimestamp: oldest,
    newestTimestamp: newest,
    observations: observations.slice(0, HISTORICAL_LIMIT),
  };
}
