import { getOpenAiClient, getOpenAiModel, useVision } from './client.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './analysisPrompt.js';
import { analysisSchema, FALLBACK_RESULT } from './analysisSchema.js';

export type { AiAnalysisInput } from './analysisPrompt.js';
export type { AiAnalysisResult } from './analysisSchema.js';

import type { AiAnalysisInput } from './analysisPrompt.js';
import type { AiAnalysisResult } from './analysisSchema.js';

export async function runAiAnalysis(input: AiAnalysisInput): Promise<AiAnalysisResult> {
  const openai = getOpenAiClient();
  if (!openai) return FALLBACK_RESULT;

  const userText = buildUserPrompt(input);
  const withVision = useVision(input.listing.imageUrl);

  const makeMessages = (includeImage: boolean) => [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    includeImage
      ? {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: userText },
            { type: 'image_url' as const, image_url: { url: input.listing.imageUrl as string } },
          ],
        }
      : { role: 'user' as const, content: userText },
  ];

  try {
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: getOpenAiModel(),
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: makeMessages(withVision),
      });
    } catch (visionErr) {
      if (withVision) {
        console.warn('[aiAnalysis] Vision call failed, retrying without image');
        completion = await openai.chat.completions.create({
          model: getOpenAiModel(),
          response_format: { type: 'json_object' },
          temperature: 0.2,
          messages: makeMessages(false),
        });
      } else {
        throw visionErr;
      }
    }

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
