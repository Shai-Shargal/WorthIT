import type { Verdict } from '../types.js';

export function computeFinalScore(priceScore: number, conditionScore: number): number {
  const safePrice = Number.isFinite(priceScore) ? priceScore : 0;
  const safeCondition = Number.isFinite(conditionScore) ? conditionScore : 1;
  const final = safePrice * safeCondition;
  return Math.max(0, Math.min(100, Math.round(final)));
}

export function finalVerdict(finalScore: number): Verdict {
  if (finalScore >= 65) return 'Good';
  if (finalScore >= 40) return 'Fair';
  return 'Bad';
}
