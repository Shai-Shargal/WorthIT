import type { AnalyzeResponse, ConditionSummary, ScoreBreakdown } from '../types.js';

export interface ExplanationContext {
  product: AnalyzeResponse['product'];
  market: AnalyzeResponse['market'];
  score: number;
  verdict: AnalyzeResponse['verdict'];
  breakdown?: ScoreBreakdown;
  condition?: ConditionSummary;
}

function formatPrice(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export async function explain(context: ExplanationContext): Promise<string> {
  const { product, market, verdict, breakdown, condition } = context;
  const diff = market.median - product.price;
  const direction = diff > 0 ? 'below' : diff < 0 ? 'above' : 'right at';
  const magnitude = market.median > 0 ? Math.abs(diff / market.median) * 100 : 0;

  const lines: string[] = [
    `${product.name} is listed at ${formatPrice(product.price, product.currency)}.`,
    `The market median across ${market.sampleSize} comparable listings is ${formatPrice(market.median, product.currency)} (range ${formatPrice(market.min, product.currency)} - ${formatPrice(market.max, product.currency)}).`,
    `That puts the asking price ${magnitude.toFixed(0)}% ${direction} the median, which we consider a ${verdict.toLowerCase()} deal.`,
  ];

  if (breakdown && breakdown.conditionScore < 1 && condition) {
    const signalText = condition.signals.length > 0 ? ` (${condition.signals.slice(0, 3).join(', ')})` : '';
    lines.push(
      `Condition appears ${condition.label}${signalText}, which adjusts the deal score from the price-only ${breakdown.priceScore} to ${context.score}.`,
    );
  }

  return lines.join(' ');
}
