import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetConditionCacheForTests, analyzeCondition } from '../src/ai/condition.js';
import { __resetOpenAiClientForTests } from '../src/ai/client.js';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  __resetConditionCacheForTests();
  __resetOpenAiClientForTests();
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
          choices: [
            {
              message: {
                content: JSON.stringify({
                  conditionScore: 1.4,
                  conditionLabel: 'excellent',
                  signals: ['like new'],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeCondition({ title: 'iPhone 13 sealed' });
    expect(result.conditionScore).toBe(1);
    expect(result.conditionLabel).toBe('excellent');
    expect(result.signals).toContain('like new');
  });
});
