import type { MarketStats } from '../types.js';

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  const weight = pos - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

// Tukey's fences using the IQR. Conservative (k=1.5) so we don't drop too much
// data from already-small comparable sets.
export function removeOutliers(prices: number[]): number[] {
  if (prices.length < 4) return prices.slice();
  const sorted = [...prices].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return sorted.filter((p) => p >= lower && p <= upper);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeStats(prices: number[]): MarketStats {
  if (prices.length === 0) {
    return { median: 0, mean: 0, min: 0, max: 0, sampleSize: 0 };
  }
  const sum = prices.reduce((acc, p) => acc + p, 0);
  return {
    median: median(prices),
    mean: sum / prices.length,
    min: Math.min(...prices),
    max: Math.max(...prices),
    sampleSize: prices.length,
  };
}
