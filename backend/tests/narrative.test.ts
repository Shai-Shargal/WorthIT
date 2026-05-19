import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  HistoricalContext,
  ListingSnapshot,
  LocalMarketContext,
  VerdictResult,
} from '../../shared/types/index.js';
import { __resetOpenAiClientForTests } from '../src/ai/client.js';
import { generateNarrative } from '../src/ai/narrative.js';

const ORIGINAL_ENV = { ...process.env };

function makeVerdict(overrides: Partial<VerdictResult> = {}): VerdictResult {
  return {
    verdict: 'worth_it',
    worthRating: 4,
    confidence: 0.6,
    confidenceLevel: 'medium',
    ...overrides,
  };
}

beforeEach(() => {
  __resetOpenAiClientForTests();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe('generateNarrative', () => {
  it('returns fallback reasoning without API key', async () => {
    const result = await generateNarrative({
      listing: {
        title: 'iPhone 13',
        price: 1500,
        currency: 'ILS',
        observedAt: new Date(),
      } as ListingSnapshot,
      localMarketContext: {
        query: 'iPhone 13',
        currency: 'ILS',
        observationCount: 5,
        typicalPrice: { p25: 1900, p50: 2050, p75: 2200 },
        recentObservations: [],
        notes: [],
      } as LocalMarketContext,
      historicalContext: { query: 'iPhone 13', totalObservations: 0, observations: [] } as HistoricalContext,
      verdict: makeVerdict(),
    });

    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.positives.length).toBeGreaterThan(0);
  });
});
