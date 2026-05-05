import type { MarketDataProvider, MarketDataQuery } from '../types.js';

// MVP fallback provider: returns deterministic comparable prices.
// Later we will implement real providers (Yad2/Facebook) via Playwright.
const STUB_PRICES: number[] = [
  1700, 1750, 1780, 1800, 1820, 1850, 1880, 1900, 1920, 1950, 1980, 2000, 2050, 2100, 2200,
];

export const staticProvider: MarketDataProvider = {
  id: 'static',
  async fetchComparablePrices(_query: MarketDataQuery): Promise<number[]> {
    return STUB_PRICES.slice();
  },
};

