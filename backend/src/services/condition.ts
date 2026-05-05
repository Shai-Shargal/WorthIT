import OpenAI from 'openai';
import { z } from 'zod';

export type ConditionLabel = 'excellent' | 'good' | 'fair' | 'poor';

export interface ConditionInput {
  title: string;
  description?: string;
  imageUrl?: string;
}

export interface ConditionResult {
  conditionScore: number;
  conditionLabel: ConditionLabel;
  signals: string[];
}

const NEUTRAL: ConditionResult = {
  conditionScore: 1,
  conditionLabel: 'good',
  signals: [],
};

const SYSTEM_PROMPT = `You evaluate the physical condition of a second-hand product based ONLY on the
title and optional description. You never judge price, market, or whether it is
a good deal. Return JSON ONLY in this exact schema:
{ "conditionScore": number 0..1, "conditionLabel": "excellent"|"good"|"fair"|"poor", "signals": string[] }
Rules:
- 1.0 = like new, sealed, never used.
- 0.0 = unusable / for parts.
- "signals" lists short phrases (<= 6 words) found in the text that support your score.
- Default to 0.7 (good) if the text is neutral and contains no condition cues.
- Output JSON only, no commentary.`;

const responseSchema = z.object({
  conditionScore: z.number(),
  conditionLabel: z.enum(['excellent', 'good', 'fair', 'poor']),
  signals: z.array(z.string()).default([]),
});

const CACHE_LIMIT = 200;
const cache = new Map<string, ConditionResult>();
let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

function cacheKey(input: ConditionInput): string {
  return [
    input.title.toLowerCase().trim(),
    (input.description ?? '').toLowerCase().trim(),
    input.imageUrl ? '1' : '0',
  ].join('|');
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  return Math.max(0, Math.min(1, value));
}

function rememberInCache(key: string, value: ConditionResult): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

export async function analyzeCondition(input: ConditionInput): Promise<ConditionResult> {
  const openai = getClient();
  if (!openai) return NEUTRAL;

  const key = cacheKey(input);
  const cached = cache.get(key);
  if (cached) return cached;

  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const useVision = process.env.OPENAI_VISION === 'true' && Boolean(input.imageUrl);
  const userText = `Title: ${input.title}\nDescription: ${input.description ?? '(none)'}`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        useVision
          ? {
              role: 'user',
              content: [
                { type: 'text', text: userText },
                { type: 'image_url', image_url: { url: input.imageUrl as string } },
              ],
            }
          : { role: 'user', content: userText },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = responseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return NEUTRAL;

    const result: ConditionResult = {
      conditionScore: clampScore(parsed.data.conditionScore),
      conditionLabel: parsed.data.conditionLabel,
      signals: parsed.data.signals.slice(0, 8),
    };
    rememberInCache(key, result);
    return result;
  } catch (err) {
    console.error('[condition] OpenAI call failed:', err instanceof Error ? err.message : err);
    return NEUTRAL;
  }
}

export function __resetConditionCacheForTests(): void {
  cache.clear();
  client = null;
}
