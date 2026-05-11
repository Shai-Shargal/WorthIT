import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { AiEvaluation, HistoricalContext, LocalMarketContext } from '../src/types.js';

vi.mock('../src/services/marketContext.js', () => ({
  buildMarketContexts: vi.fn(),
}));

vi.mock('../src/services/aiEvaluation.js', () => ({
  evaluateListing: vi.fn(),
}));

vi.mock('../src/services/condition.js', () => ({
  analyzeCondition: vi.fn(),
}));

vi.mock('../src/db/mongoose.js', () => ({
  mongoStatus: () => ({ connected: false, error: null }),
  connectMongo: async () => undefined,
}));

import { createApp } from '../src/app.js';
import { buildMarketContexts } from '../src/services/marketContext.js';
import { evaluateListing } from '../src/services/aiEvaluation.js';
import { analyzeCondition } from '../src/services/condition.js';

const buildMock = vi.mocked(buildMarketContexts);
const evaluateMock = vi.mocked(evaluateListing);
const conditionMock = vi.mocked(analyzeCondition);

function neutralCondition() {
  return { conditionScore: 1, conditionLabel: 'good' as const, signals: [] };
}

function makeContext(name: string, currency: string, observationCount = 3): {
  localMarketContext: LocalMarketContext;
  historicalContext: HistoricalContext;
} {
  return {
    localMarketContext: {
      query: name,
      currency,
      observationCount,
      priceRange: { min: 1800, max: 2200 },
      typicalPrice: { p25: 1900, p50: 2000, p75: 2100 },
      recentObservations: [],
      notes: [],
    },
    historicalContext: {
      query: name,
      totalObservations: 0,
      observations: [],
    },
  };
}

function makeEvaluation(overrides: Partial<AiEvaluation> = {}): AiEvaluation {
  return {
    summary: 'Roughly aligned with the local Israeli market band.',
    positives: ['Comparable to recent local listings'],
    concerns: [],
    recommendation: 'maybe',
    confidence: 0.6,
    ...overrides,
  };
}

beforeEach(() => {
  buildMock.mockReset();
  evaluateMock.mockReset();
  conditionMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /analyze-bulk', () => {
  it('accepts omitted query (page context) and returns AnalyzeResponse rows', async () => {
    buildMock.mockResolvedValue(makeContext('Test widget', 'USD'));
    conditionMock.mockResolvedValue(neutralCondition());
    evaluateMock.mockResolvedValue(makeEvaluation({ recommendation: 'worth_it', confidence: 0.7 }));

    const res = await request(createApp())
      .post('/analyze-bulk')
      .send({ listings: [{ title: 'Test widget', price: 900 }] });

    expect(res.status).toBe(200);
    expect(res.body.query).toBe('');
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].aiEvaluation.recommendation).toBe('worth_it');
    expect(res.body.results[0].listing.title).toBe('Test widget');
    expect(buildMock).toHaveBeenCalledWith({ name: 'Test widget', currency: 'USD' });
  });

  it('returns 400 when listings is empty', async () => {
    const res = await request(createApp())
      .post('/analyze-bulk')
      .send({ query: 'iPhone 13', listings: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/listing/i);
  });

  it('omits rows where no market context is available', async () => {
    buildMock.mockResolvedValue({
      localMarketContext: {
        query: 'unknown',
        currency: 'USD',
        observationCount: 0,
        recentObservations: [],
        notes: [],
      },
      historicalContext: {
        query: 'unknown',
        totalObservations: 0,
        observations: [],
      },
    });

    const res = await request(createApp())
      .post('/analyze-bulk')
      .send({
        query: 'unknown product',
        listings: [{ title: 'something', price: 100 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(conditionMock).not.toHaveBeenCalled();
    expect(evaluateMock).not.toHaveBeenCalled();
  });

  it('sorts results by recommendation rank then confidence', async () => {
    buildMock.mockImplementation(async ({ name, currency }) => makeContext(name, currency));
    conditionMock.mockResolvedValue(neutralCondition());
    evaluateMock.mockImplementation(async ({ listing }) => {
      if (listing.title.includes('great')) return makeEvaluation({ recommendation: 'worth_it', confidence: 0.9 });
      if (listing.title.includes('meh')) return makeEvaluation({ recommendation: 'maybe', confidence: 0.7 });
      return makeEvaluation({ recommendation: 'avoid', confidence: 0.8 });
    });

    const res = await request(createApp())
      .post('/analyze-bulk')
      .send({
        listings: [
          { title: 'bad deal', price: 5000 },
          { title: 'great deal', price: 800 },
          { title: 'meh deal', price: 2000 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { aiEvaluation: AiEvaluation }) => r.aiEvaluation.recommendation)).toEqual([
      'worth_it',
      'maybe',
      'avoid',
    ]);
  });

  it('drops UI-noise titles before calling context or AI', async () => {
    buildMock.mockResolvedValue(makeContext('placeholder', 'USD'));
    conditionMock.mockResolvedValue(neutralCondition());
    evaluateMock.mockResolvedValue(makeEvaluation());

    const res = await request(createApp())
      .post('/analyze-bulk')
      .send({
        listings: [{ title: 'פורסמו ממש עכשיו', price: 900 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
    expect(buildMock).not.toHaveBeenCalled();
    expect(evaluateMock).not.toHaveBeenCalled();
  });

  it('rejects invalid prices', async () => {
    const res = await request(createApp())
      .post('/analyze-bulk')
      .send({
        query: 'iPhone 13',
        listings: [{ title: 'iPhone 13', price: -10 }],
      });
    expect(res.status).toBe(400);
  });
});
