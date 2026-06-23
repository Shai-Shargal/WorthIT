const PRICE_REGEX =
  /(?:₪|ש["״]ח|שח|ILS|NIS)\s*([0-9][0-9,]*(?:\.[0-9]+)?)|([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:₪|ש["״]ח|שח|ILS|NIS)/gi;

export function extractPrices(text: string): number[] {
  const prices: number[] = [];
  let match: RegExpExecArray | null;
  PRICE_REGEX.lastIndex = 0;
  while ((match = PRICE_REGEX.exec(text)) !== null) {
    const raw = (match[1] ?? match[2]).replace(/,/g, '');
    const value = parseFloat(raw);
    if (Number.isFinite(value) && value > 0 && value < 10_000_000) {
      prices.push(value);
    }
  }
  return prices;
}

export function filterRelevantPrices(prices: number[], listingPrice?: number): number[] {
  if (prices.length === 0) return [];
  if (!listingPrice) return prices;
  // Keep only prices within 5x of the listing price
  // e.g. PS5 at ₪1,400 → min ₪280, max ₪7,000 (filters accessories/games)
  return prices.filter((p) => p >= listingPrice / 5 && p <= listingPrice * 5);
}

export function deduplicatePrices(prices: number[]): number[] {
  // Round to nearest 50 to bin near-identical prices, then deduplicate
  const seen = new Set<number>();
  return prices.filter((p) => {
    const bin = Math.round(p / 50) * 50;
    if (seen.has(bin)) return false;
    seen.add(bin);
    return true;
  });
}
