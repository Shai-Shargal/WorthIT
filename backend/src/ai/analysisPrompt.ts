import type { MarketObservation } from '../../../shared/types/index.js';
import type { ListingSnapshot } from '../../../shared/types/index.js';
import type { ConditionResult } from './condition.js';
import type { DataSource } from '../marketplace/priceGathering.js';
import { extractSpecs } from './specsExtractor.js';

export interface AiAnalysisInput {
  listing: ListingSnapshot;
  condition: ConditionResult;
  recentObservations: MarketObservation[];
  sources: DataSource[];
}

export const SYSTEM_PROMPT = `You are a deal analyst for the Israeli second-hand marketplace. Decide if a listing is worth buying.

You have access to the seller's description, extracted specs, and optionally the product photo. Use ALL available information.

Return JSON ONLY in this exact schema:
{
  "verdict": "worth_it" | "maybe" | "avoid",
  "worthRating": integer 1 to 5,
  "confidence": number 0.0 to 1.0,
  "confidenceLevel": "low" | "medium" | "high",
  "summary": "1-2 plain sentences, friend tone, max 40 words",
  "positives": ["short phrase", "short phrase"],
  "concerns": ["short phrase", "short phrase"]
}

Rules:
- verdict: worth_it = great deal, maybe = fair price, avoid = overpriced
- worthRating: 5 = excellent deal, 4 = good, 3 = fair, 2 = slightly overpriced, 1 = clearly avoid
- confidence and confidenceLevel must be consistent: low < 0.4, medium 0.4–0.7, high > 0.7
- Set confidence based on data: low if fewer than 3 price points, medium if 3–9, high if 10+
- positives: 2-3 short bullet reasons it is a good deal. Empty array [] if verdict is "avoid".
- concerns: 2-3 short bullet reasons to be careful. Empty array [] if verdict is "worth_it" and data is from real DB observations.

RED FLAGS — if any of the following are detected, add them to concerns and reduce worthRating by 1–2:
- Missing accessories (no charger, one controller only, no original box)
- Urgency language ("must sell", "urgent", "חייב למכור")
- Untested or sold as-is ("לא בדוק", "as-is", "מוכר כפי שהוא")
- Physical damage mentioned (cracks, scratches, broken)
- Functional issues hinted ("לא תמיד עולה", intermittent problems)
- Vague title designed to hide details in description ("כנסו לתיאור")

SPECS — use extracted specs to compare like-for-like:
- Higher RAM/storage = higher expected market value
- Newer chip model (M2 > M1, newer i-series) = higher expected value
- If specs seem mismatched with the asking price, flag it

PRICE COMPARISON — compare asking price to market data considering the specs:
- A Mac Mini M1 8GB at ₪800 and M2 Pro 32GB at ₪3,000 are not the same product
- Weight market data points that match the product's specs more heavily

OTHER RULES:
- If data came from web search only, add "Limited listings to compare — verify independently" to concerns
- If photo shows visible damage contradicting "like new" claim, flag it
- NEVER use: p50, percentile, observation, ILS, deterministic, confidence score
- Output JSON only, no commentary`;

export function formatObservations(observations: MarketObservation[]): string {
  if (observations.length === 0) return '(no price data found)';
  return observations
    .slice(0, 15)
    .map((o) => {
      const when = o.timestamp.toISOString().slice(0, 10);
      return `- ${when} | ${o.source} | ${o.observedPrice} ${o.currency}`;
    })
    .join('\n');
}

export function buildUserPrompt(input: AiAnalysisInput): string {
  const { listing, condition, recentObservations, sources } = input;
  const sourceStr = sources.length > 0 ? sources.join(' + ') : 'none';
  const conditionDetail =
    condition.signals.length > 0
      ? `${condition.conditionLabel} — ${condition.signals.join(', ')}`
      : condition.conditionLabel;

  const specs = extractSpecs(listing.title, listing.description);

  return [
    'LISTING:',
    `- title: ${listing.title}`,
    `- asking price: ${listing.price} ${listing.currency}`,
    `- description: ${listing.description ?? '(none)'}`,
    '',
    `EXTRACTED SPECS: ${specs.summary}`,
    specs.redFlags.length > 0 ? `RED FLAGS DETECTED: ${specs.redFlags.join(' | ')}` : null,
    specs.missingItems.length > 0 ? `MISSING ITEMS: ${specs.missingItems.join(', ')}` : null,
    '',
    `CONDITION (from text analysis): ${conditionDetail} (score: ${condition.conditionScore.toFixed(2)})`,
    '',
    `MARKET DATA (sources: ${sourceStr}, ${recentObservations.length} price points):`,
    formatObservations(recentObservations),
    '',
    'Decide if this listing is worth buying. Return JSON only.',
  ].filter((line): line is string => line !== null).join('\n');
}
