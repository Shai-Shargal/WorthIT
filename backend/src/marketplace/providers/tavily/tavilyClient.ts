const TAVILY_API_URL = 'https://api.tavily.com/search';

export interface TavilyResult {
  content?: string;
  snippet?: string;
}

export interface TavilyResponse {
  results?: TavilyResult[];
  answer?: string;
}

export async function fetchTavily(apiKey: string, query: string): Promise<TavilyResponse | null> {
  const response = await fetch(TAVILY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      include_answer: true,
      max_results: 5,
    }),
  });

  if (!response.ok) {
    console.error(`[tavily] HTTP ${response.status} for query: ${query}`);
    return null;
  }

  return (await response.json()) as TavilyResponse;
}

export function collectTexts(data: TavilyResponse): string[] {
  const texts: string[] = [];
  if (data.answer) texts.push(data.answer);
  for (const result of data.results ?? []) {
    if (result.content) texts.push(result.content);
    if (result.snippet) texts.push(result.snippet);
  }
  return texts;
}
