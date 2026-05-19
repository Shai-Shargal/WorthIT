import { describe, expect, it } from 'vitest';
import { describePrices, removeOutliers } from '../src/marketplace/statistics.js';

describe('statistics', () => {
  it('removes outliers with IQR', () => {
    const cleaned = removeOutliers([100, 105, 110, 115, 500]);
    expect(cleaned).not.toContain(500);
    expect(cleaned.length).toBeGreaterThan(0);
  });

  it('describes price distribution', () => {
    const dist = describePrices([100, 200, 300, 400]);
    expect(dist).not.toBeNull();
    expect(dist!.p50).toBe(250);
  });
});
