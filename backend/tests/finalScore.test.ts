import { describe, expect, it } from 'vitest';
import { computeFinalScore, finalVerdict } from '../src/services/finalScore.js';

describe('computeFinalScore', () => {
  it('multiplies price and condition and rounds', () => {
    expect(computeFinalScore(80, 0.5)).toBe(40);
    expect(computeFinalScore(75, 1)).toBe(75);
  });

  it('clamps to [0, 100]', () => {
    expect(computeFinalScore(150, 1)).toBe(100);
    expect(computeFinalScore(80, -2)).toBe(0);
  });

  it('treats non-finite condition as neutral 1.0', () => {
    expect(computeFinalScore(80, Number.NaN)).toBe(80);
  });
});

describe('finalVerdict', () => {
  it('Good >= 65', () => {
    expect(finalVerdict(65)).toBe('Good');
    expect(finalVerdict(82)).toBe('Good');
  });

  it('Fair in [40, 65)', () => {
    expect(finalVerdict(40)).toBe('Fair');
    expect(finalVerdict(64)).toBe('Fair');
  });

  it('Bad below 40', () => {
    expect(finalVerdict(39)).toBe('Bad');
    expect(finalVerdict(0)).toBe('Bad');
  });
});
