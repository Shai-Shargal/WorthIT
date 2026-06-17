import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import { buildAnalysisId, saveAnalysis, findAnalysisById } from '../src/analysis/analysisRepository.js';
import type { AnalyzeProductResponse } from '../../shared/types/index.js';

vi.mock('../src/marketplace/marketObservations.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    recordObservations: vi.fn().mockResolvedValue(1),
  };
});

function makeResponse(): AnalyzeProductResponse {
  return {
    analysisId: 'test-id-123',
    listing: { title: 'iPhone 13', price: 1500, currency: 'ILS', observedAt: new Date() },
    localMarketContext: { query: 'iPhone 13', currency: 'ILS', observationCount: 0, dataQuality: 'insufficient', recentObservations: [], notes: [] },
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

  it('findAnalysisById returns unavailable when mongo is not connected', async () => {
    const result = await findAnalysisById('any-id');
    expect(result).toBe('unavailable');
  });

  it('saveAnalysis does not throw when mongo is not connected', async () => {
    await expect(saveAnalysis('any-id', makeResponse())).resolves.not.toThrow();
  });
});

import { runProductAnalysis } from '../src/analysis/run.js';
import { recordObservations } from '../src/marketplace/marketObservations.js';

describe('runProductAnalysis', () => {
  it('records the listing as a market observation', async () => {
    const recordMock = vi.mocked(recordObservations);
    await runProductAnalysis({ title: 'iPhone 13', price: 1500, currency: 'ILS' });
    expect(recordMock).toHaveBeenCalledOnce();
    const [observations] = recordMock.mock.calls[0];
    expect(observations[0].productName).toBe('iPhone 13');
    expect(observations[0].observedPrice).toBe(1500);
    expect(observations[0].currency).toBe('ILS');
    expect(observations[0].source).toBe('facebook');
    expect(observations[0].timestamp).toBeInstanceOf(Date);
  });
});
