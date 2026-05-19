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

const SYSTEM_PROMPT = `You are WorthIT, an AI analyst for the Israeli second-hand marketplace.
Your job is to EXPLAIN a deal verdict that has already been computed deterministically.
You must NOT change the verdict or invent market facts.

Return JSON ONLY:
{
  "summary": string,
  "positives": string[],
  "concerns": string[]
}

Rules:
- summary: 1-3 sentences framing the listing for an Israeli buyer.
- positives/concerns: <= 5 short phrases each.
- Align your tone with the provided verdict (worth_it / maybe / avoid).
- Communicate uncertainty when observation count is low.
- Output JSON only.`;

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

function fallbackNarrative(input: NarrativeInput): AiReasoning {
  const { listing, localMarketContext, verdict } = input;
  const typical = localMarketContext.typicalPrice;
  const observationCount = localMarketContext.observationCount;

  const positives: string[] = [];
  const concerns: string[] = [];

  if (verdict.verdict === 'worth_it') {
    positives.push('Asking price is below the typical local band.');
  } else if (verdict.verdict === 'avoid') {
    concerns.push('Asking price is above the typical local band.');
  } else {
    positives.push('Asking price is near the typical local band.');
  }

  if (observationCount < 4) {
    concerns.push('Limited comparable observations — treat with caution.');
  }

  const summary =
    typical && observationCount > 0
      ? `For "${listing.title}" at ${listing.price} ${listing.currency}, the deterministic verdict is ${verdict.verdict.replace('_', ' ')} (worth ${verdict.worthRating}/5) based on ${observationCount} local observation${observationCount === 1 ? '' : 's'} (p50≈${typical.p50}).`
      : `For "${listing.title}", the verdict is ${verdict.verdict.replace('_', ' ')} with limited market data.`;

  return { summary, positives, concerns };
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
