// Matches ILS prices in symbol-first or symbol-last form, Hebrew and Latin notations
export const PRICE_REGEX =
  /(?:₪|ש["״]ח|שח|ILS|NIS)\s*([0-9][0-9,]*(?:\.[0-9]+)?)|([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:₪|ש["״]ח|שח|ILS|NIS)/gi;

export function extractPrices(text: string): number[] {
  const out: number[] = [];
  if (!text) return out;
  PRICE_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRICE_REGEX.exec(text)) !== null) {
    const raw = (m[1] ?? m[2]).replace(/,/g, '');
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n > 0 && n < 10_000_000) out.push(n);
  }
  return out;
}
