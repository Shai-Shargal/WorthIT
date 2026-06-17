import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/marketplace/marketObservations.js', () => ({
  recordObservations: vi.fn().mockResolvedValue(0),
}));

import { tavilySearch } from '../src/marketplace/providers/tavily.js';
import { recordObservations } from '../src/marketplace/marketObservations.js';

const recordMock = vi.mocked(recordObservations);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TAVILY_API_KEY;
});

describe('tavilySearch', () => {
  it('returns empty array when TAVILY_API_KEY is not set', async () => {
    delete process.env.TAVILY_API_KEY;
    const result = await tavilySearch({ name: 'iPhone 13', currency: 'ILS' });
    expect(result).toEqual([]);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('returns empty array and does not throw when fetch fails', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const result = await tavilySearch({ name: 'iPhone 13', currency: 'ILS' });
    expect(result).toEqual([]);
  });

  it('extracts ILS prices from snippet text and returns observations', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { content: 'אייפון 13 יד שנייה ₪2,500 מצב טוב' },
            { content: 'iPhone 13 used price 2800 ILS' },
          ],
          answer: 'המחיר הממוצע הוא 2650 ש"ח',
        }),
      }),
    );

    const result = await tavilySearch({ name: 'iPhone 13', currency: 'ILS' });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((o) => o.currency === 'ILS')).toBe(true);
    expect(result.every((o) => o.source === 'tavily')).toBe(true);
    expect(result.every((o) => o.productName === 'iPhone 13')).toBe(true);
    expect(result.every((o) => o.observedPrice > 0)).toBe(true);
    expect(recordMock).toHaveBeenCalledOnce();
  });

  it('returns empty array when Tavily returns HTTP error', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429 }),
    );
    const result = await tavilySearch({ name: 'Guitar', currency: 'ILS' });
    expect(result).toEqual([]);
  });
});
