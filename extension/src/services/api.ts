import { ANALYZE_PRODUCT_PATH, DEFAULT_API_BASE } from '../../../shared/constants/index.js';
import type { AnalyzeProductResponse, ProductInput } from '../../../shared/types/index.js';

export async function getApiBase(): Promise<string> {
  const stored = await chrome.storage.sync.get(['apiBase']);
  const base = typeof stored.apiBase === 'string' ? stored.apiBase.trim() : '';
  return base || DEFAULT_API_BASE;
}

export async function analyzeProduct(product: ProductInput): Promise<AnalyzeProductResponse> {
  const base = await getApiBase();
  const res = await fetch(`${base.replace(/\/$/, '')}${ANALYZE_PRODUCT_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return (await res.json()) as AnalyzeProductResponse;
}
