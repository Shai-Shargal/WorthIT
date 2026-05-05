import type { ParsedListing } from '../types.js';

// Matches optional currency + numeric price. Comma-separated thousands require at least one ",ddd"
// segment so "1500" is not truncated to "150". Last match wins as the listing price.
const PRICE_PATTERN =
  /(?:(?<currency>[$€£₪]|USD|EUR|GBP|ILS|NIS)\s*)?(?<value>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?<trailing>[$€£₪]|USD|EUR|GBP|ILS|NIS)?/gi;

const CURRENCY_NORMALIZATION: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '₪': 'ILS',
  NIS: 'ILS',
};

function normalizeCurrency(symbol: string | undefined): string | undefined {
  if (!symbol) return undefined;
  const upper = symbol.toUpperCase();
  return CURRENCY_NORMALIZATION[symbol] ?? CURRENCY_NORMALIZATION[upper] ?? upper;
}

function parsePriceValue(raw: string): number {
  const cleaned = raw.replace(/,/g, '');
  const num = Number(cleaned);
  if (!Number.isFinite(num)) {
    throw new Error(`Could not parse price value: ${raw}`);
  }
  return num;
}

function isLikelyUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}

export function parseListing(input: string): ParsedListing {
  const trimmed = input.trim();
  if (!trimmed) {
    throw Object.assign(new Error('Input is empty'), { status: 400 });
  }

  if (isLikelyUrl(trimmed)) {
    // TODO: fetch the URL contents and extract title + price.
    throw Object.assign(
      new Error('Link parsing is not implemented yet. Please paste the listing text instead.'),
      { status: 400 },
    );
  }

  let lastMatch: RegExpExecArray | null = null;
  PRICE_PATTERN.lastIndex = 0;
  for (;;) {
    const m = PRICE_PATTERN.exec(trimmed);
    if (!m) break;
    if (m.groups?.value) lastMatch = m;
  }

  if (!lastMatch?.groups?.value) {
    throw Object.assign(new Error('Could not detect a price in the input.'), { status: 400 });
  }

  const price = parsePriceValue(lastMatch.groups.value);
  const currency = normalizeCurrency(lastMatch.groups.currency ?? lastMatch.groups.trailing) ?? 'USD';

  const name =
    trimmed.replace(lastMatch[0], '').replace(/\s{2,}/g, ' ').trim() || 'Unknown product';

  return {
    name,
    price,
    currency,
    raw: trimmed,
  };
}
