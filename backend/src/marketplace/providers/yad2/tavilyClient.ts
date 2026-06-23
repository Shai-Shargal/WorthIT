import type { TavilyResponse } from './types.js';

const TAVILY_API_URL = 'https://api.tavily.com/search';
const TAVILY_TIMEOUT_MS = 10_000;
const TAVILY_MAX_RESULTS = 5;

export async function tavilySearch(query: string): Promise<TavilyResponse | undefined> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('[yad2] TAVILY_API_KEY not set — skipping Tavily search');
    return undefined;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);
  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        include_answer: true,
        max_results: TAVILY_MAX_RESULTS,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`[yad2] Tavily HTTP ${response.status} for query: ${query}`);
      return undefined;
    }

    return (await response.json()) as TavilyResponse;
  } catch (err) {
    console.warn('[yad2] Tavily search failed:', err instanceof Error ? err.message : err);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
