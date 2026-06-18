import type {
  HistoricalContext,
  LocalMarketContext,
  MarketObservation,
} from '../../../shared/types/index.js';
import { findSimilarObservations, recordObservations } from './marketObservations.js';
import { tavilySearch } from './providers/tavily.js';
import { describePrices, removeOutliers } from './statistics.js';

const RECENT_WINDOW_DAYS = 90;
const RECENT_LIMIT = 30;
const HISTORICAL_LIMIT = 50;
const TAVILY_THRESHOLD = 5;

export type DataSource = 'db' | 'tavily';

export interface PriceGatheringResult {
  localMarketContext: LocalMarketContext;
  historicalContext: HistoricalContext;
  recentObservations: MarketObservation[];
  sources: DataSource[];
}

function round(n: number): number {
  return Math.round(n);
}

function buildDataQuality(
  dbCount: number,
  tavilyCount: number,
): 'real' | 'seed' | 'limited' | 'insufficient' {
  if (dbCount >= TAVILY_THRESHOLD) return 'real';
  if (dbCount === 0 && tavilyCount === 0) return 'insufficient';
  if (dbCount === 0 && tavilyCount > 0) return 'seed';
  return 'limited';
}

function buildLocalContext(
  query: string,
  currency: string,
  observations: MarketObservation[],
  dataQuality: 'real' | 'seed' | 'limited' | 'insufficient',
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

function buildHistoricalContext(
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

export async function gatherPrices(query: {
  name: string;
  currency: string;
  listingPrice?: number;
}): Promise<PriceGatheringResult> {
  const currency = query.currency.trim().toUpperCase();
  const notes: string[] = [];
  const sources: DataSource[] = [];

  const [recentDb, historicalDb] = await Promise.all([
    findSimilarObservations({
      name: query.name,
      currency,
      sinceDays: RECENT_WINDOW_DAYS,
      limit: RECENT_LIMIT,
    }),
    findSimilarObservations({
      name: query.name,
      currency,
      olderThanDays: RECENT_WINDOW_DAYS,
      limit: HISTORICAL_LIMIT,
    }),
  ]);

  if (recentDb.length > 0) sources.push('db');

  let recent = recentDb;
  let tavilyCount = 0;

  if (recentDb.length < TAVILY_THRESHOLD) {
    const tavilyObs = await tavilySearch({ name: query.name, currency, listingPrice: query.listingPrice }).catch((err) => {
      console.error('[priceGathering] tavily failed:', err instanceof Error ? err.message : err);
      return [] as MarketObservation[];
    });

    if (tavilyObs.length > 0) {
      recent = [...recentDb, ...tavilyObs];
      tavilyCount = tavilyObs.length;
      sources.push('tavily');
      notes.push('Prices sourced from web search — verify independently.');
      void recordObservations(tavilyObs);
    }
  }

  if (recent.length === 0) {
    notes.push('No market data found for this product.');
  }

  const dataQuality = buildDataQuality(recentDb.length, tavilyCount);
  const localMarketContext = buildLocalContext(query.name, currency, recent, dataQuality, notes);
  const historicalContext = buildHistoricalContext(query.name, historicalDb);

  return { localMarketContext, historicalContext, recentObservations: recent, sources };
}
