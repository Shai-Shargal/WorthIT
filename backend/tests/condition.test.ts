import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetConditionCacheForTests, analyzeCondition } from '../src/services/condition.js';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  __resetConditionCacheForTests();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.OPENAI_API_KEY;
  delete process.env.LLM_API_KEY;
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe('analyzeCondition', () => {
  it('returns neutral fallback when OPENAI_API_KEY is missing', async () => {
    const result = await analyzeCondition({ title: 'iPhone 13 used' });
    expect(result).toEqual({ conditionScore: 1, conditionLabel: 'good', signals: [] });
  });

  it('parses OpenAI JSON, clamps the score, and forwards signals', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 'x',
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  conditionScore: 1.4,
                  conditionLabel: 'poor',
                  signals: ['cracked screen', 'not working'],
                }),
              },
              finish_reason: 'stop',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeCondition({ title: 'iPhone 13 broken' });

    expect(result.conditionScore).toBe(1);
    expect(result.conditionLabel).toBe('poor');
    expect(result.signals).toEqual(['cracked screen', 'not working']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to neutral when fetch throws', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    const result = await analyzeCondition({ title: 'sealed iPhone 13' });
    expect(result).toEqual({ conditionScore: 1, conditionLabel: 'good', signals: [] });
  });

  it('caches repeated lookups for the same input', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  conditionScore: 0.6,
                  conditionLabel: 'fair',
                  signals: ['scratches'],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const a = await analyzeCondition({ title: 'iPhone 13 fair' });
    const b = await analyzeCondition({ title: 'iPhone 13 fair' });

    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
