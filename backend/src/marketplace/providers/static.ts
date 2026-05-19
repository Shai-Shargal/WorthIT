import type { MarketObservation } from '../../../../shared/types/index.js';
import type { MarketDataProvider, MarketDataQuery } from './types.js';

const DEFAULT_PHONE_BAND = [
  1700, 1750, 1780, 1800, 1820, 1850, 1880, 1900, 1920, 1950, 1980, 2000, 2050, 2100, 2200,
];

function scaleForCurrency(amounts: number[], currency: string): number[] {
  const cc = currency.trim().toUpperCase();
  if (cc === 'ILS' || cc === 'NIS') return amounts.map((n) => Math.round(n * 3.7));
  return amounts.slice();
}

function bandUsd(nameRaw: string): number[] {
  const n = nameRaw.toLowerCase();

  if (/piano|פסנתר|פסנתרון|kawai|clavinova|קאויאי/i.test(nameRaw))
    return [3200, 3800, 4200, 4600, 4900, 5200, 5600];

  if (/dock|thinkpad\s*dock|thunderbolt\s*hub|תחנת\s*עגינה|thinkpad\s*usb/i.test(nameRaw))
    return [120, 180, 220, 260, 320, 420];

  if (/mac\s*mini|ipad|iphone|\bmini\s*m\d/i.test(n)) return [1500, 1700, 1900, 2100, 2300];

  if (/aputure|lantern|\blight\b|תאור|צילום.*אור/i.test(nameRaw))
    return [280, 360, 400, 480, 650];

  if (/guitar|guitars|גיטרה|אקוסטית/i.test(nameRaw)) return [450, 550, 650, 780, 900];

  if (/\bbikes?\b|cycling|אופניים|אופני/i.test(nameRaw)) return [80, 120, 200, 350, 600];

  if (/bmw|audi|mercedes|\b jeep|מכונית|vehicle|\bcar\b/i.test(nameRaw))
    return [65000, 88000, 95000, 110000, 125000];

  return DEFAULT_PHONE_BAND.slice();
}

export const staticProvider: MarketDataProvider = {
  id: 'static',
  async fetchObservations(query: MarketDataQuery): Promise<MarketObservation[]> {
    const prices = scaleForCurrency(bandUsd(query.name), query.currency);
    const now = new Date();
    const currency = query.currency.trim().toUpperCase() || 'USD';
    return prices.map((price) => ({
      productName: query.name,
      observedPrice: price,
      currency,
      source: 'static-seed',
      timestamp: now,
    }));
  },
};
