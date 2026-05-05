import type { Verdict } from '../types.js';

export interface ScoreResult {
  score: number;
  verdict: Verdict;
}

// Score reflects how much cheaper the asking price is vs. the market median.
// score = (median - price) / median, mapped from [-1, +1] onto [0, 100] and
// clamped. 50 means "equal to median".
export function score(price: number, marketMedian: number): ScoreResult {
  if (!Number.isFinite(marketMedian) || marketMedian <= 0) {
    return { score: 50, verdict: 'Fair' };
  }
  const ratio = (marketMedian - price) / marketMedian;
  const clamped = Math.max(-1, Math.min(1, ratio));
  const numericScore = Math.round((clamped + 1) * 50);

  let verdict: Verdict = 'Fair';
  if (numericScore >= 65) verdict = 'Good';
  else if (numericScore < 45) verdict = 'Bad';

  return { score: numericScore, verdict };
}
