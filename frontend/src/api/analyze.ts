import type { AnalyzeResponse } from '../types';
import { parseError } from './http';

export type { AnalyzeResponse } from '../types';

export async function analyzeDeal(input: string): Promise<AnalyzeResponse> {
  const res = await fetch('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });

  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  return data as AnalyzeResponse;
}
