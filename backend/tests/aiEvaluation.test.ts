import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  HistoricalContext,
  ListingSnapshot,
  LocalMarketContext,
  MarketObservation,
} from '../src/types.js';
import { __resetAiEvaluationForTests, evaluateListing } from '../src/services/aiEvaluation.js';

const ORIGINAL_ENV = { ...process.env };

function makeListing(overrides: Partial<ListingSnapshot> = {}): ListingSnapshot {
  return {
    title: 'iPhone 13 128GB',
    price: 1500,
    currency: 'ILS',
    source: 'manual',
    observedAt: new Date('2026-01-15T00:00:00Z'),
    ...overrides,
  };
}

function makeObservation(overrides: Partial<MarketObservation> = {}): MarketObservation {
  return {
    productName: 'iPhone 13',
    observedPrice: 2000,
    currency: 'ILS',
    source: 'yad2',
    timestamp: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeLocalContext(overrides: Partial<LocalMarketContext> = {}): LocalMarketContext {
  return {
    query: 'iPhone 13',
    currency: 'ILS',
    observationCount: 5,
    priceRange: { min: 1800, max: 2400 },
    typicalPrice: { p25: 1900, p50: 2050, p75: 2200 },
    recentObservations: [makeObservation()],
    notes: [],
    ...overrides,
  };
}

function makeHistoricalContext(overrides: Partial<HistoricalContext> = {}): HistoricalContext {
  return {
    query: 'iPhone 13',
    totalObservations: 0,
    observations: [],
    ...overrides,
  };
}

beforeEach(() => {
  __resetAiEvaluationForTests();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.OPENAI_API_KEY;
  delete process.env.LLM_API_KEY;
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe('evaluateListing — deterministic fallback (no API key)', () => {
  it('flags below-band asking price as worth_it', async () => {
    const result = await evaluateListing({
      listing: makeListing({ price: 1500 }),
      localMarketContext: makeLocalContext(),
      historicalContext: makeHistoricalContext(),
    });

    expect(result.recommendation).toBe('worth_it');
    expect(result.confidence).toBeLessThanOrEqual(0.4);
    expect(result.estimatedValue).toEqual({ min: 1800, max: 2400, currency: 'ILS' });
  });

  it('flags above-band asking price as avoid', async () => {
    const result = await evaluateListing({
      listing: makeListing({ price: 2800 }),
      localMarketContext: makeLocalContext(),
      historicalContext: makeHistoricalContext(),
    });

    expect(result.recommendation).toBe('avoid');
  });

  it('falls back to maybe with low confidence when no observations exist', async () => {
    const result = await evaluateListing({
      listing: makeListing({ price: 1500 }),
      localMarketContext: makeLocalContext({
        observationCount: 0,
        priceRange: undefined,
        typicalPrice: undefined,
        recentObservations: [],
      }),
      historicalContext: makeHistoricalContext(),
    });

    expect(result.recommendation).toBe('maybe');
    expect(result.confidence).toBeLessThan(0.2);
    expect(result.estimatedValue).toBeUndefined();
    expect(result.concerns.some((c) => c.toLowerCase().includes('observations'))).toBe(true);
  });
});

describe('evaluateListing — OpenAI integration', () => {
  it('parses OpenAI JSON, clamps confidence, and forwards positives/concerns', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'Listing is slightly below the typical Israeli market band.',
                  positives: ['Below typical p50'],
                  concerns: ['Few recent observations'],
                  recommendation: 'worth_it',
                  confidence: 1.4,
                  estimatedValue: { min: 1800, max: 2300, currency: 'ILS' },
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await evaluateListing({
      listing: makeListing({ price: 1700 }),
      localMarketContext: makeLocalContext(),
      historicalContext: makeHistoricalContext(),
    });

    expect(result.recommendation).toBe('worth_it');
    expect(result.confidence).toBe(1);
    expect(result.positives).toContain('Below typical p50');
    expect(result.concerns).toContain('Few recent observations');
    expect(result.estimatedValue).toEqual({ min: 1800, max: 2300, currency: 'ILS' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back deterministically when OpenAI returns invalid JSON', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'not-json' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const result = await evaluateListing({
      listing: makeListing({ price: 1500 }),
      localMarketContext: makeLocalContext(),
      historicalContext: makeHistoricalContext(),
    });

    expect(result.recommendation).toBe('worth_it');
    expect(result.summary).toMatch(/AI evaluation is disabled|Based on/i);
  });
});
