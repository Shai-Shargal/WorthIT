import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketObservation } from '../../shared/types/index.js';

vi.mock('../src/ai/client.js', () => ({
  getOpenAiClient: vi.fn(),
  getOpenAiModel: vi.fn().mockReturnValue('gpt-4o-mini'),
  useVision: vi.fn().mockReturnValue(false),
}));

import { runAiAnalysis } from '../src/ai/aiAnalysis.js';
import { getOpenAiClient } from '../src/ai/client.js';
import type { ConditionResult } from '../src/ai/condition.js';

const getClientMock = vi.mocked(getOpenAiClient);

const CONDITION: ConditionResult = {
  conditionScore: 0.7,
  conditionLabel: 'good',
  signals: ['normal wear'],
};

const OBS: MarketObservation = {
  productName: 'iPhone 13',
  observedPrice: 2000,
  currency: 'ILS',
  source: 'tavily',
  timestamp: new Date('2026-05-01T00:00:00Z'),
};

const LISTING = {
  title: 'iPhone 13',
  price: 1500,
  currency: 'ILS',
  observedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runAiAnalysis', () => {
  it('returns fallback result when OpenAI client is not available', async () => {
    getClientMock.mockReturnValue(null);

    const result = await runAiAnalysis({
      listing: LISTING,
      condition: CONDITION,
      recentObservations: [],
      sources: [],
    });

    expect(result.verdict.verdict).toBe('maybe');
    expect(result.verdict.confidenceLevel).toBe('low');
    expect(result.reasoning.summary).toBeTruthy();
  });

  it('returns parsed verdict and reasoning from valid OpenAI response', async () => {
    const validJson = JSON.stringify({
      verdict: 'worth_it',
      worthRating: 5,
      confidence: 0.8,
      confidenceLevel: 'high',
      summary: 'Great price for an iPhone 13.',
      positives: ['Well below market price', 'Good condition'],
      concerns: [],
    });

    getClientMock.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: validJson } }],
          }),
        },
      },
    } as never);

    const result = await runAiAnalysis({
      listing: LISTING,
      condition: CONDITION,
      recentObservations: [OBS],
      sources: ['tavily'],
    });

    expect(result.verdict.verdict).toBe('worth_it');
    expect(result.verdict.worthRating).toBe(5);
    expect(result.verdict.confidence).toBe(0.8);
    expect(result.verdict.confidenceLevel).toBe('high');
    expect(result.reasoning.summary).toBe('Great price for an iPhone 13.');
    expect(result.reasoning.positives).toHaveLength(2);
    expect(result.reasoning.concerns).toHaveLength(0);
  });

  it('returns fallback when OpenAI returns malformed JSON', async () => {
    getClientMock.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: '{ "invalid": true }' } }],
          }),
        },
      },
    } as never);

    const result = await runAiAnalysis({
      listing: LISTING,
      condition: CONDITION,
      recentObservations: [OBS],
      sources: ['db'],
    });

    expect(result.verdict.verdict).toBe('maybe');
    expect(result.verdict.confidenceLevel).toBe('low');
  });

  it('returns fallback when OpenAI throws', async () => {
    getClientMock.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('rate limited')),
        },
      },
    } as never);

    const result = await runAiAnalysis({
      listing: LISTING,
      condition: CONDITION,
      recentObservations: [],
      sources: [],
    });

    expect(result.verdict.verdict).toBe('maybe');
  });
});
