import { __resetOpenAiClientForTests, getOpenAiClient, getOpenAiModel, useVision } from './client.js';
import {
  CONDITION_SYSTEM_PROMPT,
  conditionResponseSchema,
  NEUTRAL_CONDITION,
  clampScore,
  type ConditionInput,
  type ConditionResult,
} from './conditionSchema.js';
import { cacheKey, getCachedCondition, rememberCondition, clearConditionCache } from './conditionCache.js';

export type { ConditionInput, ConditionResult, ConditionLabel } from './conditionSchema.js';

export async function analyzeCondition(input: ConditionInput): Promise<ConditionResult> {
  const openai = getOpenAiClient();
  if (!openai) return NEUTRAL_CONDITION;

  const key = cacheKey(input);
  const cached = getCachedCondition(key);
  if (cached) return cached;

  const model = getOpenAiModel();
  const userText = `Title: ${input.title}\nDescription: ${input.description ?? '(none)'}`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: CONDITION_SYSTEM_PROMPT },
        useVision(input.imageUrl)
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
    let jsonObj: unknown;
    try {
      jsonObj = JSON.parse(raw);
    } catch {
      console.error('[condition] malformed JSON: not valid JSON');
      return NEUTRAL_CONDITION;
    }
    const parsed = conditionResponseSchema.safeParse(jsonObj);
    if (!parsed.success) return NEUTRAL_CONDITION;

    const result: ConditionResult = {
      conditionScore: clampScore(parsed.data.conditionScore),
      conditionLabel: parsed.data.conditionLabel,
      signals: parsed.data.signals.slice(0, 8),
    };
    rememberCondition(key, result);
    return result;
  } catch (err) {
    console.error('[condition] OpenAI call failed:', err instanceof Error ? err.message : err);
    return NEUTRAL_CONDITION;
  }
}

export function __resetConditionCacheForTests(): void {
  clearConditionCache();
  __resetOpenAiClientForTests();
}
