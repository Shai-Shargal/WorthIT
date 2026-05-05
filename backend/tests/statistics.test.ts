import { describe, expect, it } from 'vitest';
import { computeStats, median, removeOutliers } from '../src/services/statistics.js';

describe('statistics', () => {
  it('computes median for even and odd arrays', () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('removes extreme outlier with IQR', () => {
    const cleaned = removeOutliers([2200, 2300, 2400, 2500, 2600, 12000]);
    expect(cleaned).not.toContain(12000);
  });

  it('computes stats fields', () => {
    const stats = computeStats([2200, 2300, 2400, 2500]);
    expect(stats.median).toBe(2350);
    expect(stats.mean).toBe(2350);
    expect(stats.min).toBe(2200);
    expect(stats.max).toBe(2500);
    expect(stats.sampleSize).toBe(4);
  });
});

