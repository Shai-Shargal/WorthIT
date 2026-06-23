import type { ConditionInput, ConditionResult } from './conditionSchema.js';

const CACHE_LIMIT = 200;
const cache = new Map<string, ConditionResult>();

export function cacheKey(input: ConditionInput): string {
  return [
    input.title.toLowerCase().trim(),
    (input.description ?? '').toLowerCase().trim(),
    input.imageUrl ? '1' : '0',
  ].join('|');
}

export function getCachedCondition(key: string): ConditionResult | undefined {
  return cache.get(key);
}

export function rememberCondition(key: string, value: ConditionResult): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

export function clearConditionCache(): void {
  cache.clear();
}
