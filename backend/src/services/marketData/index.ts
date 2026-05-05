import { staticProvider } from './providers/static.js';
import type { MarketDataProvider, MarketDataQuery } from './types.js';

const PROVIDERS: Record<string, MarketDataProvider> = {
  [staticProvider.id]: staticProvider,
};

function resolveProvider(): MarketDataProvider {
  const requested = (process.env.MARKET_DATA_PROVIDER ?? 'static').toLowerCase();
  const provider = PROVIDERS[requested];
  if (!provider) {
    const available = Object.keys(PROVIDERS).join(', ');
    throw new Error(`Unknown MARKET_DATA_PROVIDER "${requested}". Available: ${available}`);
  }
  return provider;
}

export async function getMarketData(query: MarketDataQuery): Promise<number[]> {
  const provider = resolveProvider();
  return provider.fetchComparablePrices(query);
}

export type { MarketDataProvider, MarketDataQuery } from './types.js';
