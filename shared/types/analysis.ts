import type { HistoricalContext, LocalMarketContext } from './market.js';
import type { ListingSnapshot } from './product.js';

export type Verdict = 'worth_it' | 'maybe' | 'avoid';

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface EstimatedValueRange {
  min: number;
  max: number;
  currency: string;
}

/** Deterministic outcome — not produced by the LLM. */
export interface VerdictResult {
  verdict: Verdict;
  worthRating: number;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  estimatedValue?: EstimatedValueRange;
}

/** AI-generated explanation only — does not override verdict. */
export interface AiReasoning {
  summary: string;
  positives: string[];
  concerns: string[];
}

export interface AnalyzeProductResponse {
  analysisId: string;
  listing: ListingSnapshot;
  localMarketContext: LocalMarketContext;
  historicalContext: HistoricalContext;
  verdict: VerdictResult;
  reasoning: AiReasoning;
}
