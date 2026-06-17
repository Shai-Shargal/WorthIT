import type { MarketObservation } from '../../../../shared/types/index.js';
import { recordObservations } from '../marketObservations.js';

const TAVILY_API_URL = 'https://api.tavily.com/search';
const MAX_OBSERVATIONS_PER_SEARCH = 15;

const PRICE_REGEX =
  /(?:₪|ש["״]ח|שח|ILS|NIS)\s*([0-9][0-9,]*(?:\.[0-9]+)?)|([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:₪|ש["״]ח|שח|ILS|NIS)/gi;

function extractPrices(text: string): number[] {
  const prices: number[] = [];
  let match: RegExpExecArray | null;
  PRICE_REGEX.lastIndex = 0;
  while ((match = PRICE_REGEX.exec(text)) !== null) {
    const raw = (match[1] ?? match[2]).replace(/,/g, '');
    const value = parseFloat(raw);
    if (Number.isFinite(value) && value > 0 && value < 10_000_000) {
      prices.push(value);
    }
  }
  return prices;
}

function filterRelevantPrices(prices: number[], listingPrice?: number): number[] {
  if (prices.length === 0) return [];
  if (!listingPrice) return prices;
  // Keep only prices within 5x of the listing price
  // e.g. PS5 at ₪1,400 → min ₪280, max ₪7,000 (filters accessories/games at ₪89-₪199)
  return prices.filter((p) => p >= listingPrice / 5 && p <= listingPrice * 5);
}

function deduplicatePrices(prices: number[]): number[] {
  // Round to nearest 50 to bin near-identical prices, then deduplicate
  const seen = new Set<number>();
  return prices.filter((p) => {
    const bin = Math.round(p / 50) * 50;
    if (seen.has(bin)) return false;
    seen.add(bin);
    return true;
  });
}

interface TavilyResult {
  content?: string;
  snippet?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
  answer?: string;
}

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
      const response = await fetch(TAVILY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: q,
          search_depth: 'advanced',
          include_answer: true,
          max_results: 5,
        }),
      });

      if (!response.ok) {
        console.error(`[tavily] HTTP ${response.status} for query: ${q}`);
        continue;
      }

      const data = (await response.json()) as TavilyResponse;
      const texts: string[] = [];
      if (data.answer) texts.push(data.answer);
      for (const result of data.results ?? []) {
        if (result.content) texts.push(result.content);
        if (result.snippet) texts.push(result.snippet);
      }

      for (const text of texts) {
        allPrices.push(...extractPrices(text));
      }
    } catch (err) {
      console.error('[tavily] search failed:', err instanceof Error ? err.message : err);
    }
  }

  // Filter irrelevant prices, deduplicate, and cap total saved
  const filtered = filterRelevantPrices(allPrices, query.listingPrice);
  const deduped = deduplicatePrices(filtered);
  const capped = deduped.slice(0, MAX_OBSERVATIONS_PER_SEARCH);

  const observations: MarketObservation[] = capped.map((price) => ({
    productName: query.name,
    observedPrice: price,
    currency: query.currency,
    source: 'tavily',
    timestamp: now,
  }));

  if (observations.length > 0) {
    void recordObservations(observations);
  }

  return observations;
}
