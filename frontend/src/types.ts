export type Verdict = 'Good' | 'Fair' | 'Bad';
export type ConditionLabel = 'excellent' | 'good' | 'fair' | 'poor';
export type ListingSource = 'facebook' | 'yad2';

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

export interface AnalyzeProduct {
  name: string;
  price: number;
  currency: string;
}

export interface AnalyzeResponse {
  product: AnalyzeProduct;
  market: {
    median: number;
    mean: number;
    min: number;
    max: number;
    sampleSize: number;
  };
  score: number;
  verdict: Verdict;
  breakdown: ScoreBreakdown;
  condition: ConditionSummary;
  explanation: string;
}

export interface SearchResult {
  id: string;
  title: string;
  price: number;
  source: ListingSource;
  url?: string;
  image?: string;
  location?: string;
  extractedAt: string;
  score: number;
  verdict: Verdict;
  breakdown: ScoreBreakdown;
  condition: ConditionSummary;
}

export interface SearchResponse {
  query: string;
  market: MarketSummary | null;
  results: SearchResult[];
}
