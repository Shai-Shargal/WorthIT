import type {
  HistoricalContext,
  LocalMarketContext,
  MarketObservation,
} from '../../../shared/types/index.js';
import { findSimilarObservations, recordObservations } from './marketObservations.js';
import { tavilySearch } from './providers/tavily.js';
import { extractSpecs, buildEnrichedQuery } from '../ai/specsExtractor.js';
import { buildDataQuality, buildLocalContext, buildHistoricalContext } from './pricing/contextBuilders.js';

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

export async function gatherPrices(query: {
  name: string;
  currency: string;
  listingPrice?: number;
  description?: string;
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
    const specs = extractSpecs(query.name, query.description);
    const enrichedName = buildEnrichedQuery(query.name, specs);
    const tavilyObs = await tavilySearch({
      name: enrichedName,
      currency,
      listingPrice: query.listingPrice,
    }).catch((err) => {
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
