import { z } from 'zod';
import type { AiReasoning, MarketObservation, VerdictResult } from '../../../shared/types/index.js';
import type { ListingSnapshot } from '../../../shared/types/index.js';
import type { ConditionResult } from './condition.js';
import { getOpenAiClient, getOpenAiModel, useVision } from './client.js';
import type { DataSource } from '../marketplace/priceGathering.js';

export interface AiAnalysisInput {
  listing: ListingSnapshot;
  condition: ConditionResult;
  recentObservations: MarketObservation[];
  sources: DataSource[];
}

export interface AiAnalysisResult {
  verdict: VerdictResult;
  reasoning: AiReasoning;
}

const SYSTEM_PROMPT = `You are a deal analyst for the Israeli second-hand marketplace. Decide if a listing is worth buying.

You have access to the seller's description and optionally the product photo. Use ALL available information:
- The seller's description reveals condition, what's included, missing parts, or red flags
- The photo can confirm or contradict the seller's claims about condition

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
- If data came from web search only (sources includes tavily but not db), always add "Limited listings to compare — verify independently" to concerns.
- If the photo shows visible damage or the description mentions missing parts, reflect that in concerns and lower the rating.
- NEVER use these words: p50, percentile, observation, ILS, deterministic, confidence score.
- Output JSON only, no commentary.`;

const analysisSchema = z.object({
  verdict: z.enum(['worth_it', 'maybe', 'avoid']),
  worthRating: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  confidenceLevel: z.enum(['low', 'medium', 'high']),
  summary: z.string().min(1),
  positives: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
});

const FALLBACK_RESULT: AiAnalysisResult = {
  verdict: {
    verdict: 'maybe',
    worthRating: 3,
    confidence: 0.1,
    confidenceLevel: 'low',
  },
  reasoning: {
    summary: 'Could not fully analyze this listing. Check similar listings to compare pricing.',
    positives: [],
    concerns: ['Limited data available — verify the price independently'],
  },
};

function formatObservations(observations: MarketObservation[]): string {
  if (observations.length === 0) return '(no price data found)';
  return observations
    .slice(0, 15)
    .map((o) => {
      const when = o.timestamp.toISOString().slice(0, 10);
      return `- ${when} | ${o.source} | ${o.observedPrice} ${o.currency}`;
    })
    .join('\n');
}

function buildUserPrompt(input: AiAnalysisInput): string {
  const { listing, condition, recentObservations, sources } = input;
  const sourceStr = sources.length > 0 ? sources.join(' + ') : 'none';
  const conditionDetail =
    condition.signals.length > 0
      ? `${condition.conditionLabel} — ${condition.signals.join(', ')}`
      : condition.conditionLabel;

  return [
    'LISTING:',
    `- title: ${listing.title}`,
    `- asking price: ${listing.price} ${listing.currency}`,
    `- description: ${listing.description ?? '(none)'}`,
    '',
    `CONDITION (from text analysis): ${conditionDetail} (score: ${condition.conditionScore.toFixed(2)})`,
    '',
    `MARKET DATA (sources: ${sourceStr}, ${recentObservations.length} price points):`,
    formatObservations(recentObservations),
    '',
    'Decide if this listing is worth buying. Return JSON only.',
  ].join('\n');
}

export async function runAiAnalysis(input: AiAnalysisInput): Promise<AiAnalysisResult> {
  const openai = getOpenAiClient();
  if (!openai) return FALLBACK_RESULT;

  const userText = buildUserPrompt(input);
  const withVision = useVision(input.listing.imageUrl);

  try {
    const completion = await openai.chat.completions.create({
      model: getOpenAiModel(),
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        withVision
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
    let jsonObj: unknown;
    try {
      jsonObj = JSON.parse(raw);
    } catch {
      console.error('[aiAnalysis] malformed JSON: not valid JSON');
      return FALLBACK_RESULT;
    }
    const parsed = analysisSchema.safeParse(jsonObj);

    if (!parsed.success) {
      console.error('[aiAnalysis] malformed JSON:', parsed.error.message);
      return FALLBACK_RESULT;
    }

    return {
      verdict: {
        verdict: parsed.data.verdict,
        worthRating: parsed.data.worthRating,
        confidence: parsed.data.confidence,
        confidenceLevel: parsed.data.confidenceLevel,
      },
      reasoning: {
        summary: parsed.data.summary,
        positives: parsed.data.positives.slice(0, 8),
        concerns: parsed.data.concerns.slice(0, 8),
      },
    };
  } catch (err) {
    console.error('[aiAnalysis] OpenAI failed:', err instanceof Error ? err.message : err);
    return FALLBACK_RESULT;
  }
}
