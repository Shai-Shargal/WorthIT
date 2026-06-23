import type { MarketObservation } from '../../../../shared/types/index.js';
import { extractPrices, filterRelevantPrices, deduplicatePrices } from './tavily/priceParser.js';
import { fetchTavily, collectTexts } from './tavily/tavilyClient.js';

const MAX_OBSERVATIONS_PER_SEARCH = 15;

export async function tavilySearch(query: {
  name: string;
  currency: string;
  listingPrice?: number;
}): Promise<MarketObservation[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  if (query.currency.toUpperCase() !== 'ILS') return [];

  const queries = [
    `"${query.name}" יד שנייה מחיר`,
    `"${query.name}" second hand price Israel`,
  ];

  const allPrices: number[] = [];
  const now = new Date();

  for (const q of queries) {
    try {
      const data = await fetchTavily(apiKey, q);
      if (!data) continue;

      for (const text of collectTexts(data)) {
        allPrices.push(...extractPrices(text));
      }
    } catch (err) {
      console.error('[tavily] search failed:', err instanceof Error ? err.message : err);
    }
  }

  const filtered = filterRelevantPrices(allPrices, query.listingPrice);
  const deduped = deduplicatePrices(filtered);
  const capped = deduped.slice(0, MAX_OBSERVATIONS_PER_SEARCH);

  return capped.map((price) => ({
    productName: query.name,
    observedPrice: price,
    currency: query.currency,
    source: 'tavily',
    timestamp: now,
  }));
}
