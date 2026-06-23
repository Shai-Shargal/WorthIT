import { z } from 'zod';
import type { AiReasoning, VerdictResult } from '../../../shared/types/index.js';

export interface AiAnalysisResult {
  verdict: VerdictResult;
  reasoning: AiReasoning;
}

export const analysisSchema = z.object({
  verdict: z.enum(['worth_it', 'maybe', 'avoid']),
  worthRating: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  confidenceLevel: z.enum(['low', 'medium', 'high']),
  summary: z.string().min(1),
  positives: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
});

export const FALLBACK_RESULT: AiAnalysisResult = {
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
