import * as cheerio from 'cheerio';

export function parsePriceText(text: string | undefined): number {
  if (!text) return 0;
  const match = text.replace(/[\s,]/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const n = Number.parseFloat(match[1]);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function parseCurrency(text: string | undefined): string {
  if (!text) return 'USD';
  if (/\bILS\b|₪|שח/i.test(text)) return 'ILS';
  if (/\bEUR\b|€/.test(text)) return 'EUR';
  if (/\bGBP\b|£/.test(text)) return 'GBP';
  if (/\bUSD\b|\$/.test(text)) return 'USD';
  return 'USD';
}

export function firstText($: cheerio.CheerioAPI, selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length === 0) continue;
    const txt = el.text().trim();
    if (txt) return txt;
  }
  return undefined;
}

export function firstAttr(
  $: cheerio.CheerioAPI,
  selectors: Array<[selector: string, attr: string]>,
): string | undefined {
  for (const [sel, attr] of selectors) {
    const el = $(sel).first();
    if (el.length === 0) continue;
    const v = el.attr(attr);
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}
