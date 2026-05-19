import type { AnalyzeProductResponse } from '../../../shared/types/index.js';

const CACHE_LIMIT = 500;
const TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
  value: AnalyzeProductResponse;
}

const cache = new Map<string, CacheEntry>();

export function listingFingerprint(listing: {
  title: string;
  price: number;
  currency: string;
  url?: string;
}): string {
  const urlKey = listing.url ? listing.url.split('?')[0] : '';
  return [
    listing.title.toLowerCase().trim(),
    String(listing.price),
    listing.currency.toUpperCase(),
    urlKey,
  ].join('|');
}

export function getCachedAnalysis(key: string): AnalyzeProductResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedAnalysis(key: string, value: AnalyzeProductResponse): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

export function __clearAnalysisCacheForTests(): void {
  cache.clear();
}
