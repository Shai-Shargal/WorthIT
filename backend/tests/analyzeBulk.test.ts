import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/services/marketData/index.js', () => ({
  getMarketData: vi.fn(),
}));

vi.mock('../src/services/condition.js', () => ({
  analyzeCondition: vi.fn(),
}));

vi.mock('../src/db/mongoose.js', () => ({
  mongoStatus: () => ({ connected: false, error: null }),
  connectMongo: async () => undefined,
}));

import { createApp } from '../src/app.js';
import { getMarketData } from '../src/services/marketData/index.js';
import { analyzeCondition } from '../src/services/condition.js';

const getMarketDataMock = vi.mocked(getMarketData);
const analyzeConditionMock = vi.mocked(analyzeCondition);

beforeEach(() => {
  getMarketDataMock.mockReset();
  analyzeConditionMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function neutralCondition() {
  return { conditionScore: 1, conditionLabel: 'good' as const, signals: [] };
}

describe('POST /analyze-bulk', () => {
  it('accepts omit query (page context)', async () => {
    getMarketDataMock.mockResolvedValueOnce([1000, 1100]);
    analyzeConditionMock.mockResolvedValue(neutralCondition());
    const res = await request(createApp())
      .post('/analyze-bulk')
      .send({ listings: [{ title: 'Test widget', price: 900 }] });
    expect(res.status).toBe(200);
    expect(res.body.query).toBe('');
    expect(res.body.market).toBeNull();
    expect(res.body.results).toHaveLength(1);
    expect(getMarketDataMock).toHaveBeenCalledWith({ name: 'Test widget', currency: 'USD' });
  });

  it('returns 400 when listings is empty', async () => {
    const res = await request(createApp())
      .post('/analyze-bulk')
      .send({ query: 'iPhone 13', listings: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/listing/i);
  });

  it('returns empty results when no market data for listings', async () => {
    getMarketDataMock.mockResolvedValue([]);
    const res = await request(createApp())
      .post('/analyze-bulk')
      .send({
        query: 'unknown product',
        listings: [{ title: 'something', price: 100 }],
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      query: 'unknown product',
      market: null,
      results: [],
    });
    expect(analyzeConditionMock).not.toHaveBeenCalled();
  });

  it('scores each listing vs its own market sample and attaches comps', async () => {
    getMarketDataMock.mockImplementation(async ({ name }) => {
      if (name.includes('cheap')) return [900, 1000, 1100];
      if (name.includes('expensive')) return [4000, 4200, 4500];
      return [1900];
    });
    analyzeConditionMock.mockResolvedValue(neutralCondition());

    const res = await request(createApp())
      .post('/analyze-bulk')
      .send({
        listings: [
          { title: 'cheap widget', price: 950, currency: 'USD' },
          { title: 'expensive piano', price: 4100, currency: 'ILS' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.market).toBeNull();
    expect(res.body.results).toHaveLength(2);

    const cheap = res.body.results.find((r: { title: string }) => r.title.includes('cheap'));
    const expensive = res.body.results.find((r: { title: string }) => r.title.includes('expensive'));
    expect(cheap.currency).toBe('USD');
    expect(expensive.currency).toBe('ILS');
    expect(cheap.comps.sampleSize).toBe(3);
    expect(expensive.comps.sampleSize).toBe(3);
    expect(cheap.comps.median).toBe(1000);
    expect(expensive.comps.median).toBe(4200);
  });

  it('drops UI-noise titles before calling providers', async () => {
    getMarketDataMock.mockResolvedValue([1700]);
    analyzeConditionMock.mockResolvedValue(neutralCondition());
    const res = await request(createApp()).post('/analyze-bulk').send({
      listings: [{ title: 'פורסמו ממש עכשיו', price: 900 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
    expect(getMarketDataMock).not.toHaveBeenCalled();
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
