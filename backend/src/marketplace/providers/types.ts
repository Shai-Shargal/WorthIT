import type { MarketObservation } from '../../../../shared/types/index.js';

export interface MarketDataQuery {
  name: string;
  currency: string;
}

export interface MarketDataProvider {
  id: string;
  fetchObservations(query: MarketDataQuery): Promise<MarketObservation[]>;
}
