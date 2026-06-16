import { z } from 'zod';
import type {
  AiReasoning,
  HistoricalContext,
  ListingSnapshot,
  LocalMarketContext,
  MarketObservation,
  VerdictResult,
} from '../../../shared/types/index.js';
import type { ConditionResult } from './condition.js';
import { getOpenAiClient, getOpenAiModel, useVision } from './client.js';

export interface NarrativeInput {
  listing: ListingSnapshot;
  localMarketContext: LocalMarketContext;
  historicalContext: HistoricalContext;
  verdict: VerdictResult;
  condition?: ConditionResult;
}

const SYSTEM_PROMPT = `You are a knowledgeable friend helping someone decide if a second-hand deal in Israel is worth buying.
Your job is to EXPLAIN a verdict that has already been decided — do NOT change it or invent facts.

Return JSON ONLY:
{
  "summary": string,
  "positives": string[],
  "concerns": string[]
}

Rules:
- NEVER use these words: deterministic, p50, local band, observation, ILS, confidence score, percentile.
- summary: 1-2 plain sentences. Say what the price means compared to similar items. Under 40 words.
- positives: 2-3 short bullet phrases (reasons it's a good deal). Empty array for avoid verdict.
- concerns: 2-3 short bullet phrases (things to watch out for). Empty array for worth_it verdict — UNLESS data quality is seed or insufficient (see below).
- DATA QUALITY RULE (overrides all others): If DATA QUALITY is seed or insufficient, you MUST include exactly this concern regardless of verdict: "Limited listings to compare — verify independently."
- Match tone to verdict: enthusiastic for worth_it, balanced for maybe, direct for avoid.
- Output JSON only, no commentary.`;

const narrativeSchema = z.object({
  summary: z.string().min(1),
  positives: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
});

function describeObservations(observations: MarketObservation[], limit: number): string {
  if (observations.length === 0) return '(none)';
  return observations
    .slice(0, limit)
    .map((obs) => {
      const when = obs.timestamp.toISOString().slice(0, 10);
      return `- ${when} | ${obs.source} | ${obs.observedPrice} ${obs.currency} | "${obs.productName}"`;
    })
    .join('\n');
}

function buildUserPrompt(input: NarrativeInput): string {
  const { listing, localMarketContext, historicalContext, verdict, condition } = input;

  const conditionLine = condition
    ? `Condition: ${condition.conditionLabel} (${condition.signals.join(', ') || 'neutral'})`
    : 'Condition: (not analyzed)';

  const typical = localMarketContext.typicalPrice;
  const band = typical
    ? `p25=${typical.p25}, p50=${typical.p50}, p75=${typical.p75}`
    : 'no band';

  return [
    `DETERMINISTIC VERDICT (do not override): ${verdict.verdict}`,
    `Worth rating: ${verdict.worthRating}/5`,
    `Confidence: ${verdict.confidence.toFixed(2)} (${verdict.confidenceLevel})`,
    `DATA QUALITY: ${localMarketContext.dataQuality}${localMarketContext.dataQuality !== 'real' ? ' — explicitly note limited data in concerns' : ''}`,
    '',
    'LISTING:',
    `- title: ${listing.title}`,
    `- asking price: ${listing.price} ${listing.currency}`,
    listing.description ? `- description: ${listing.description}` : null,
    conditionLine,
    '',
    `LOCAL MARKET (${localMarketContext.observationCount} observations, ${band}):`,
    describeObservations(localMarketContext.recentObservations, 8),
    '',
    `HISTORICAL (${historicalContext.totalObservations} older observations):`,
    describeObservations(historicalContext.observations, 4),
    '',
    'Write explanation JSON only.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${Math.round(price)} ${currency}`;
  }
}

function fallbackNarrative(input: NarrativeInput): AiReasoning {
  const { listing, localMarketContext, verdict } = input;
  const typical = localMarketContext.typicalPrice;
  const isLowData = localMarketContext.dataQuality !== 'real';
  const lowDataNote = 'Limited listings to compare — verify independently.';

  const typicalStr = typical ? ` (around ${formatPrice(typical.p50, listing.currency)})` : '';
  const priceStr = formatPrice(listing.price, listing.currency);

  if (verdict.verdict === 'worth_it') {
    return {
      summary: `At ${priceStr}, this is well below what similar items typically sell for${typicalStr}. Looks like a solid deal.`,
      positives: ['Price is below the typical market rate'],
      concerns: isLowData ? [lowDataNote] : [],
    };
  }

  if (verdict.verdict === 'avoid') {
    return {
      summary: `At ${priceStr}, this is above what similar items typically sell for${typicalStr}. You can probably find a better deal.`,
      positives: [],
      concerns: [
        'Above the typical market rate',
        isLowData ? lowDataNote : 'Check other listings for better pricing',
      ],
    };
  }

  // maybe
  return {
    summary: `At ${priceStr}, this is roughly in line with similar items${typicalStr}. Not a standout deal, but not overpriced either.`,
    positives: ['Price is near the typical market rate'],
    concerns: isLowData ? [lowDataNote] : ['Not a standout deal — worth comparing other listings'],
  };
}

export async function generateNarrative(input: NarrativeInput): Promise<AiReasoning> {
  const openai = getOpenAiClient();
  if (!openai) return fallbackNarrative(input);

  const model = getOpenAiModel();
  const userText = buildUserPrompt(input);

  try {
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        useVision(input.listing.imageUrl)
          ? {
              role: 'user',
              content: [
                { type: 'text', text: userText },
                { type: 'image_url', image_url: { url: input.listing.imageUrl as string } },
              ],
            }
          : { role: 'user', content: userText },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = narrativeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.error('[narrative] malformed JSON:', parsed.error.message);
      return fallbackNarrative(input);
    }

    return {
      summary: parsed.data.summary,
      positives: parsed.data.positives.slice(0, 8),
      concerns: parsed.data.concerns.slice(0, 8),
    };
  } catch (err) {
    console.error('[narrative] OpenAI failed:', err instanceof Error ? err.message : err);
    return fallbackNarrative(input);
  }
}
