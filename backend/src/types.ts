export type Verdict = 'Good' | 'Fair' | 'Bad';

export type ConditionLabel = 'excellent' | 'good' | 'fair' | 'poor';

export interface AnalyzeRequest {
  input: string;
}

export interface ParsedListing {
  name: string;
  price: number;
  currency: string;
  raw: string;
}

export interface MarketStats {
  median: number;
  mean: number;
  min: number;
  max: number;
  sampleSize: number;
}

export interface ScoreBreakdown {
  priceScore: number;
  conditionScore: number;
}

export interface ConditionSummary {
  label: ConditionLabel;
  signals: string[];
}

export interface AnalyzeResponse {
  product: {
    name: string;
    price: number;
    currency: string;
  };
  market: MarketStats;
  score: number;
  verdict: Verdict;
  breakdown: ScoreBreakdown;
  condition: ConditionSummary;
  explanation: string;
}
