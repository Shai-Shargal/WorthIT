import type { MarketObservation } from '../../../../shared/types/index.js';
import { recordObservations } from '../marketObservations.js';

const TAVILY_API_URL = 'https://api.tavily.com/search';

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
}): Promise<MarketObservation[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const queries = [
    `"${query.name}" יד שנייה מחיר`,
    `"${query.name}" second hand price Israel`,
  ];

  const observations: MarketObservation[] = [];
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
        for (const price of extractPrices(text)) {
          observations.push({
            productName: query.name,
            observedPrice: price,
            currency: query.currency,
            source: 'tavily',
            timestamp: now,
          });
        }
      }
    } catch (err) {
      console.error('[tavily] search failed:', err instanceof Error ? err.message : err);
    }
  }

  if (observations.length > 0) {
    void recordObservations(observations);
  }

  return observations;
}
