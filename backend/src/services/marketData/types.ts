export interface MarketDataQuery {
  name: string;
  currency: string;
}

export interface MarketDataProvider {
  readonly id: string;
  fetchComparablePrices(query: MarketDataQuery): Promise<number[]>;
}
