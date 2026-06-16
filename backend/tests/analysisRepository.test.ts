import { describe, it, expect } from 'vitest';
import { buildAnalysisId, saveAnalysis, findAnalysisById } from '../src/analysis/analysisRepository.js';
import type { AnalyzeProductResponse } from '../../shared/types/index.js';

function makeResponse(): AnalyzeProductResponse {
  return {
    analysisId: 'test-id-123',
    listing: { title: 'iPhone 13', price: 1500, currency: 'ILS', observedAt: new Date() },
    localMarketContext: { query: 'iPhone 13', currency: 'ILS', observationCount: 0, recentObservations: [], notes: [] },
    historicalContext: { query: 'iPhone 13', totalObservations: 0, observations: [] },
    verdict: { verdict: 'maybe', worthRating: 3, confidence: 0.1, confidenceLevel: 'low' },
    reasoning: { summary: 'Test', positives: [], concerns: [] },
  };
}

describe('analysisRepository', () => {
  it('buildAnalysisId returns a non-empty string', () => {
    const id = buildAnalysisId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('findAnalysisById returns null when mongo is not connected', async () => {
    const result = await findAnalysisById('any-id');
    expect(result).toBeNull();
  });

  it('saveAnalysis does not throw when mongo is not connected', async () => {
    await expect(saveAnalysis('any-id', makeResponse())).resolves.not.toThrow();
  });
});
