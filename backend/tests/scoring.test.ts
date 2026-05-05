import { describe, expect, it } from 'vitest';
import { score } from '../src/services/scoring.js';

describe('score', () => {
  it('returns Good when listing is much cheaper than median', () => {
    const result = score(1700, 2500);
    expect(result.verdict).toBe('Good');
    expect(result.score).toBeGreaterThanOrEqual(65);
  });

  it('returns Fair near median', () => {
    const result = score(2480, 2500);
    expect(result.verdict).toBe('Fair');
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.score).toBeLessThan(65);
  });

  it('returns Bad when price is above median', () => {
    const result = score(3200, 2500);
    expect(result.verdict).toBe('Bad');
    expect(result.score).toBeLessThan(45);
  });
});

