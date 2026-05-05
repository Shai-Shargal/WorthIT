import type { AnalyzeBulkResponse, ExtractedListing } from './types';

const DEFAULT_API_BASE = 'http://localhost:4000';

export async function getApiBase(): Promise<string> {
  try {
    const stored = await chrome.storage.sync.get('apiBase');
    const value = stored?.apiBase;
    if (typeof value === 'string' && value.length > 0) return value.replace(/\/$/, '');
  } catch {
    // chrome.storage may be unavailable in some contexts
  }
  return DEFAULT_API_BASE;
}

function dominantCurrency(listings: ExtractedListing[]): string {
  const counts = new Map<string, number>();
  for (const l of listings) {
    counts.set(l.currency, (counts.get(l.currency) ?? 0) + 1);
  }
  let best = 'USD';
  let bestCount = -1;
  for (const [ccy, n] of counts) {
    if (n > bestCount) {
      bestCount = n;
      best = ccy;
    }
  }
  return best;
}

export async function analyzeBulk(payload: {
  query: string;
  currency?: string;
  listings: ExtractedListing[];
}): Promise<AnalyzeBulkResponse> {
  const base = await getApiBase();
  const defaultCcy =
    payload.currency ??
    (payload.listings.length > 0 ? dominantCurrency(payload.listings) : 'USD');

  const res = await fetch(`${base}/analyze-bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: payload.query,
      currency: defaultCcy,
      listings: payload.listings,
    }),
  });

  const data: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errMsg =
      typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(errMsg);
  }

  return data as AnalyzeBulkResponse;
}
