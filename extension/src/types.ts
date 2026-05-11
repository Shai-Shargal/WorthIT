export type Recommendation = 'worth_it' | 'maybe' | 'avoid';
export type ConditionLabel = 'excellent' | 'good' | 'fair' | 'poor';
export type ListingSource = 'facebook' | 'yad2' | 'manual';

export interface ExtractedListing {
  title: string;
  price: number;
  /** ISO 4217 code (e.g. ILS, USD) inferred from the price label or page locale. */
  currency: string;
  url?: string;
  image?: string;
}

export interface ListingSnapshot {
  title: string;
  price: number;
  currency: string;
  description?: string;
  imageUrl?: string;
  url?: string;
  source?: ListingSource;
  observedAt: string;
}

export interface MarketObservation {
  productName: string;
  observedPrice: number;
  currency: string;
  source: string;
  condition?: string;
  location?: string;
  timestamp: string;
}

export interface PriceRange {
  min: number;
  max: number;
}

export interface TypicalPriceBand {
  p25: number;
  p50: number;
  p75: number;
}

export interface LocalMarketContext {
  query: string;
  currency: string;
  observationCount: number;
  priceRange?: PriceRange;
  typicalPrice?: TypicalPriceBand;
  recentObservations: MarketObservation[];
  notes: string[];
}

export interface HistoricalContext {
  query: string;
  totalObservations: number;
  oldestTimestamp?: string;
  newestTimestamp?: string;
  observations: MarketObservation[];
}

export interface EstimatedValueRange {
  min: number;
  max: number;
  currency: string;
}

export interface AiEvaluation {
  summary: string;
  positives: string[];
  concerns: string[];
  recommendation: Recommendation;
  confidence: number;
  estimatedValue?: EstimatedValueRange;
}

export interface AnalyzeResponse {
  listing: ListingSnapshot;
  localMarketContext: LocalMarketContext;
  historicalContext: HistoricalContext;
  aiEvaluation: AiEvaluation;
}

export interface AnalyzeBulkResponse {
  query: string;
  results: AnalyzeResponse[];
}

export type WorthitMessage =
  | { type: 'WORTHIT_SCORE' }
  | { type: 'WORTHIT_PING' };
