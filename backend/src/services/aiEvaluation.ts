import OpenAI from 'openai';
import { z } from 'zod';
import type {
  AiEvaluation,
  HistoricalContext,
  ListingSnapshot,
  LocalMarketContext,
  MarketObservation,
  Recommendation,
} from '../types.js';
import type { ConditionResult } from './condition.js';

export interface AiEvaluationInput {
  listing: ListingSnapshot;
  localMarketContext: LocalMarketContext;
  historicalContext: HistoricalContext;
  condition?: ConditionResult;
}

const SYSTEM_PROMPT = `You are WorthIT, an AI analyst for the Israeli second-hand marketplace ecosystem
(Yad2, Facebook Marketplace Israel, local Telegram groups). You reason about whether a listing is
worth buying based on the listing itself plus observed Israeli market signals.

Core principles:
- There is no single "true price". Markets shift, listings disappear, sellers negotiate.
- Communicate uncertainty naturally. When few or stale observations exist, lower your confidence.
- Reason about the listing title, description, condition signals, asking price, and how it compares
  to recent local observations. Consider whether the listing looks like a serious offer or noise.
- Prefer Israeli context (ILS pricing, local availability, common seller patterns) over global
  benchmarks like Amazon.
- Never invent specific marketplace facts. Only use the structured context provided.

Return JSON ONLY in this exact schema:
{
  "summary": string,                            // 1-3 sentences, Israeli market framing
  "positives": string[],                        // <= 5 short phrases
  "concerns": string[],                         // <= 5 short phrases
  "recommendation": "worth_it" | "maybe" | "avoid",
  "confidence": number,                         // 0..1, lower when context is thin or stale
  "estimatedValue": { "min": number, "max": number, "currency": string } | null
}

Rules:
- summary, positives, concerns are user-facing strings (English or Hebrew, match the listing language).
- recommendation reflects "is this a good buy right now?"
- estimatedValue is a *range*, not a verdict on the asking price. Omit (use null) when too few
  comparable observations exist.
- Output JSON only, no commentary.`;

const aiEvaluationSchema = z.object({
  summary: z.string().min(1),
  positives: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  recommendation: z.enum(['worth_it', 'maybe', 'avoid']),
  confidence: z.number(),
  estimatedValue: z
    .object({
      min: z.number(),
      max: z.number(),
      currency: z.string(),
    })
    .nullable()
    .optional(),
});

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.3;
  return Math.max(0, Math.min(1, value));
}

function describeObservations(observations: MarketObservation[], limit: number): string {
  if (observations.length === 0) return '(none)';
  return observations
    .slice(0, limit)
    .map((obs) => {
      const when = obs.timestamp.toISOString().slice(0, 10);
      const condition = obs.condition ? `, condition=${obs.condition}` : '';
      const location = obs.location ? `, location=${obs.location}` : '';
      return `- ${when} | ${obs.source} | ${obs.observedPrice} ${obs.currency} | "${obs.productName}"${condition}${location}`;
    })
    .join('\n');
}

function buildUserPrompt(input: AiEvaluationInput): string {
  const { listing, localMarketContext, historicalContext, condition } = input;

  const conditionLine = condition
    ? `Condition signals: ${condition.conditionLabel} (${condition.signals.join(', ') || 'no explicit signals'})`
    : 'Condition signals: (not analyzed)';

  const localPrice = localMarketContext.typicalPrice
    ? `typical p25=${localMarketContext.typicalPrice.p25}, p50=${localMarketContext.typicalPrice.p50}, p75=${localMarketContext.typicalPrice.p75}`
    : 'no typical price band';
  const localRange = localMarketContext.priceRange
    ? `range ${localMarketContext.priceRange.min}-${localMarketContext.priceRange.max}`
    : 'no range';
  const notes = localMarketContext.notes.length > 0 ? `\nNotes: ${localMarketContext.notes.join('; ')}` : '';

  return [
    'LISTING (Israeli second-hand market):',
    `- title: ${listing.title}`,
    `- asking price: ${listing.price} ${listing.currency}`,
    listing.description ? `- description: ${listing.description}` : null,
    listing.source ? `- source: ${listing.source}` : null,
    listing.url ? `- url: ${listing.url}` : null,
    conditionLine,
    '',
    `LOCAL MARKET CONTEXT (currency=${localMarketContext.currency}, observations=${localMarketContext.observationCount}):`,
    `${localPrice}; ${localRange}.${notes}`,
    'Recent observations:',
    describeObservations(localMarketContext.recentObservations, 10),
    '',
    `HISTORICAL CONTEXT (older than the recent window, total=${historicalContext.totalObservations}):`,
    describeObservations(historicalContext.observations, 6),
    '',
    'Evaluate this listing for an Israeli buyer. Respond with JSON only.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function deterministicFallback(input: AiEvaluationInput): AiEvaluation {
  const { listing, localMarketContext } = input;
  const typical = localMarketContext.typicalPrice;
  const observationCount = localMarketContext.observationCount;

  let recommendation: Recommendation = 'maybe';
  let summary = 'AI evaluation is disabled (no OPENAI_API_KEY); falling back to a basic comparison.';
  const positives: string[] = [];
  const concerns: string[] = [
    'AI reasoning disabled — recommendation is rule-based and low confidence.',
  ];

  if (typical && observationCount > 0) {
    const ratio = listing.price / typical.p50;
    if (ratio <= 0.8) {
      recommendation = 'worth_it';
      positives.push('Asking price is meaningfully below the typical local band.');
    } else if (ratio >= 1.2) {
      recommendation = 'avoid';
      concerns.push('Asking price is meaningfully above the typical local band.');
    } else {
      recommendation = 'maybe';
      positives.push('Asking price is roughly in line with recent local observations.');
    }
    summary = `Based on ${observationCount} recent Israeli-market observation${observationCount === 1 ? '' : 's'}, this listing sits around the local typical band (p50≈${typical.p50} ${localMarketContext.currency}). Confidence is low without AI reasoning.`;
  } else {
    concerns.push('No comparable Israeli-market observations available.');
  }

  const confidence = Math.min(0.4, 0.05 + observationCount * 0.05);

  return {
    summary,
    positives,
    concerns,
    recommendation,
    confidence,
    estimatedValue:
      localMarketContext.priceRange && observationCount >= 3
        ? {
            min: localMarketContext.priceRange.min,
            max: localMarketContext.priceRange.max,
            currency: localMarketContext.currency,
          }
        : undefined,
  };
}

function safeParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function evaluateListing(input: AiEvaluationInput): Promise<AiEvaluation> {
  const openai = getClient();
  if (!openai) return deterministicFallback(input);

  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const useVision = process.env.OPENAI_VISION === 'true' && Boolean(input.listing.imageUrl);
  const userText = buildUserPrompt(input);

  try {
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        useVision
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
    const parsed = aiEvaluationSchema.safeParse(safeParseJson(raw));
    if (!parsed.success) {
      console.error('[aiEvaluation] OpenAI returned malformed JSON:', parsed.error.message);
      return deterministicFallback(input);
    }

    const data = parsed.data;
    return {
      summary: data.summary,
      positives: data.positives.slice(0, 8),
      concerns: data.concerns.slice(0, 8),
      recommendation: data.recommendation,
      confidence: clamp01(data.confidence),
      estimatedValue:
        data.estimatedValue && data.estimatedValue.min >= 0 && data.estimatedValue.max >= data.estimatedValue.min
          ? {
              min: data.estimatedValue.min,
              max: data.estimatedValue.max,
              currency: data.estimatedValue.currency || input.localMarketContext.currency,
            }
          : undefined,
    };
  } catch (err) {
    console.error('[aiEvaluation] OpenAI call failed:', err instanceof Error ? err.message : err);
    return deterministicFallback(input);
  }
}

export function __resetAiEvaluationForTests(): void {
  client = null;
}
