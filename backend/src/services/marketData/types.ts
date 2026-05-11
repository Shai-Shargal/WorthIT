import type { MarketObservation } from '../../types.js';

export interface MarketDataQuery {
  name: string;
  currency: string;
}

export interface MarketDataProvider {
  readonly id: string;
  fetchObservations(query: MarketDataQuery): Promise<MarketObservation[]>;
}
