import { describe, expect, it } from 'vitest';
import { describePrices, median, removeOutliers } from '../src/services/statistics.js';

describe('statistics', () => {
  it('computes median for even and odd arrays', () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('removes extreme outlier with IQR', () => {
    const cleaned = removeOutliers([2200, 2300, 2400, 2500, 2600, 12000]);
    expect(cleaned).not.toContain(12000);
  });

  it('describes a price distribution with quantiles', () => {
    const dist = describePrices([2200, 2300, 2400, 2500]);
    expect(dist).not.toBeNull();
    expect(dist?.min).toBe(2200);
    expect(dist?.max).toBe(2500);
    expect(dist?.p50).toBe(2350);
    expect(dist?.p25).toBeLessThanOrEqual(dist?.p50 ?? 0);
    expect(dist?.p75).toBeGreaterThanOrEqual(dist?.p50 ?? 0);
  });

  it('returns null for empty input', () => {
    expect(describePrices([])).toBeNull();
  });
});
