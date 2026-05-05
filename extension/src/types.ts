export type Verdict = 'Good' | 'Fair' | 'Bad';
export type ConditionLabel = 'excellent' | 'good' | 'fair' | 'poor';

export interface ScoreBreakdown {
  priceScore: number;
  conditionScore: number;
}

export interface ConditionSummary {
  label: ConditionLabel;
  signals: string[];
}

export interface MarketSummary {
  median: number;
  average: number;
  min: number;
  max: number;
  sampleSize: number;
}

export interface ExtractedListing {
  title: string;
  price: number;
  /** ISO 4217 code (e.g. ILS, USD) inferred from the price label or page locale. */
  currency: string;
  url?: string;
  image?: string;
}

export interface AnalyzedListing {
  id: string;
  title: string;
  price: number;
  source: 'facebook' | 'yad2';
  currency?: string;
  url?: string;
  image?: string;
  location?: string;
  extractedAt: string;
  score: number;
  verdict: Verdict;
  breakdown: ScoreBreakdown;
  condition: ConditionSummary;
  /** Market stats for this listing’s own title (per-product compare). */
  comps: MarketSummary;
}

export interface AnalyzeBulkResponse {
  query: string;
  /** Legacy aggregate field; extension flow uses per-row `comps` instead. */
  market: MarketSummary | null;
  results: AnalyzedListing[];
}

export type WorthitMessage =
  | { type: 'WORTHIT_SCORE' }
  | { type: 'WORTHIT_PING' };
