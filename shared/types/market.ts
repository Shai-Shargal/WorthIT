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
