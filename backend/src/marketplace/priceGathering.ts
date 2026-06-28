import type {
  HistoricalContext,
  LocalMarketContext,
  MarketObservation,
} from '../../../shared/types/index.js';
import { findSimilarObservations, recordObservations } from './marketObservations.js';
import { findSimilarListings } from './listings.js';
import { tavilySearch } from './providers/tavily.js';
import { extractSpecs, buildEnrichedQuery } from '../ai/specsExtractor.js';
import { buildDataQuality, buildLocalContext, buildHistoricalContext } from './pricing/contextBuilders.js';

const RECENT_WINDOW_DAYS = 90;
const RECENT_LIMIT = 30;
const HISTORICAL_LIMIT = 50;
const TAVILY_THRESHOLD = 5;

export type DataSource = 'db' | 'listing-db' | 'tavily';

export interface PriceGatheringResult {
  localMarketContext: LocalMarketContext;
  historicalContext: HistoricalContext;
  recentObservations: MarketObservation[];
  sources: DataSource[];
}

export async function gatherPrices(query: {
  name: string;
  currency: string;
  listingPrice?: number;
  description?: string;
}): Promise<PriceGatheringResult> {
  const currency = query.currency.trim().toUpperCase();
  const notes: string[] = [];
  const sources: DataSource[] = [];

  // Query both collections in parallel: the passive-collection Listing
  // (real FB prices, highest quality) + the MarketObservation event log
  // (may include previous Tavily seeds). Historical only from MarketObservation
  // for now — Listing price history will be a future addition.
  const [recentListings, recentDb, historicalDb] = await Promise.all([
    findSimilarListings({
      name: query.name,
      currency,
      sinceDays: RECENT_WINDOW_DAYS,
      limit: RECENT_LIMIT,
    }),
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

  if (recentListings.length > 0) sources.push('listing-db');
  if (recentDb.length > 0) sources.push('db');

  // Merge: passive listings first (highest quality), then MarketObservation,
  // capped at RECENT_LIMIT so we don't bloat the AI prompt.
  const combined = [...recentListings, ...recentDb].slice(0, RECENT_LIMIT);
  let recent = combined;
  let tavilyCount = 0;

  if (combined.length < TAVILY_THRESHOLD) {
    const specs = extractSpecs(query.name, query.description);
    const enrichedName = buildEnrichedQuery(query.name, specs, query.description);
    const tavilyObs = await tavilySearch({
      name: enrichedName,
      currency,
      listingPrice: query.listingPrice,
    }).catch((err) => {
      console.error('[priceGathering] tavily failed:', err instanceof Error ? err.message : err);
      return [] as MarketObservation[];
    });

    if (tavilyObs.length > 0) {
      recent = [...combined, ...tavilyObs];
      tavilyCount = tavilyObs.length;
      sources.push('tavily');
      notes.push('Prices sourced from web search — verify independently.');
      void recordObservations(tavilyObs);
    }
  }

  if (recent.length === 0) {
    notes.push('No market data found for this product.');
  }

  // dataQuality: real if we have enough from either DB source.
  const realDbCount = recentListings.length + recentDb.length;
  const dataQuality = buildDataQuality(realDbCount, tavilyCount);
  const localMarketContext = buildLocalContext(query.name, currency, recent, dataQuality, notes);
  const historicalContext = buildHistoricalContext(query.name, historicalDb);

  return { localMarketContext, historicalContext, recentObservations: recent, sources };
}
