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

export const CONDITION_SYSTEM_PROMPT = `You evaluate the physical condition of a second-hand product based ONLY on the
title and optional description. You never judge price, market, or whether it is
a good deal. Return JSON ONLY in this exact schema:
{ "conditionScore": number 0..1, "conditionLabel": "excellent"|"good"|"fair"|"poor", "signals": string[] }
Rules:
- 1.0 = like new, sealed, never used.
- 0.0 = unusable / for parts.
- "signals" lists short phrases (<= 6 words) found in the text that support your score.
- Default to 0.7 (good) if the text is neutral and contains no condition cues.
- Output JSON only, no commentary.`;

export const conditionResponseSchema = z.object({
  conditionScore: z.number(),
  conditionLabel: z.enum(['excellent', 'good', 'fair', 'poor']),
  signals: z.array(z.string()).default([]),
});

export const NEUTRAL_CONDITION: ConditionResult = {
  conditionScore: 1,
  conditionLabel: 'good',
  signals: [],
};

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  return Math.max(0, Math.min(1, value));
}
