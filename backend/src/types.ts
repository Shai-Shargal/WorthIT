export type ListingSource = 'facebook' | 'yad2' | 'manual';

export type Recommendation = 'worth_it' | 'maybe' | 'avoid';

export interface AnalyzeRequest {
  input: string;
}

export interface ParsedListing {
  name: string;
  price: number;
  currency: string;
  raw: string;
}

export interface ListingSnapshot {
  title: string;
  price: number;
  currency: string;
  description?: string;
  imageUrl?: string;
  url?: string;
  source?: ListingSource;
  observedAt: Date;
}

export interface MarketObservation {
  productName: string;
  observedPrice: number;
  currency: string;
  source: string;
  condition?: string;
  location?: string;
  timestamp: Date;
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
  oldestTimestamp?: Date;
  newestTimestamp?: Date;
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
