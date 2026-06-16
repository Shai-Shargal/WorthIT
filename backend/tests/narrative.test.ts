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
        dataQuality: 'real',
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

describe('fallback narrative — plain language', () => {
  it('does not contain jargon words in worth_it fallback', async () => {
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
        dataQuality: 'real',
        typicalPrice: { p25: 1900, p50: 2050, p75: 2200 },
        recentObservations: [],
        notes: [],
      } as LocalMarketContext,
      historicalContext: { query: 'iPhone 13', totalObservations: 0, observations: [] } as HistoricalContext,
      verdict: makeVerdict({ verdict: 'worth_it' }),
    });

    const allText = [result.summary, ...result.positives, ...result.concerns].join(' ').toLowerCase();
    expect(allText).not.toContain('deterministic');
    expect(allText).not.toContain('p50');
    expect(allText).not.toContain('local band');
    expect(allText).not.toContain('observation');
    expect(result.summary.length).toBeGreaterThan(10);
  });

  it('includes low-data warning in summary when dataQuality is seed', async () => {
    const result = await generateNarrative({
      listing: { title: 'Guitar', price: 500, currency: 'ILS', observedAt: new Date() } as ListingSnapshot,
      localMarketContext: {
        query: 'Guitar',
        currency: 'ILS',
        observationCount: 7,
        dataQuality: 'seed',
        typicalPrice: { p25: 600, p50: 700, p75: 800 },
        recentObservations: [],
        notes: [],
      } as LocalMarketContext,
      historicalContext: { query: 'Guitar', totalObservations: 0, observations: [] } as HistoricalContext,
      verdict: makeVerdict({ verdict: 'worth_it' }),
    });

    const allText = [result.summary, ...result.concerns].join(' ').toLowerCase();
    expect(allText).toMatch(/limited|rough|estimated|few/i);
  });
});
