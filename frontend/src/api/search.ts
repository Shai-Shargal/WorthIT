import type { SearchResponse } from '../types';
import { parseError } from './http';

export type { SearchResponse, SearchResult } from '../types';

export async function searchDeals(q: string): Promise<SearchResponse> {
  const res = await fetch(`/search?q=${encodeURIComponent(q)}`);
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  return data as SearchResponse;
}
