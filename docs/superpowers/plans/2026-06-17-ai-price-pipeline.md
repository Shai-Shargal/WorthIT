# AI Price Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static seed + deterministic verdict formula with a two-stage AI pipeline: Tavily web search feeds real prices into MongoDB, then OpenAI receives all gathered data and decides the full verdict and reasoning.

**Architecture:** Stage 1 (`priceGathering.ts`) queries MongoDB for recent observations; if fewer than 5 are found, it calls Tavily to search for real prices and saves the results to MongoDB. Stage 2 (`aiAnalysis.ts`) receives the listing, condition, and all gathered observations and makes a single structured OpenAI call that returns the full verdict and reasoning. `run.ts` orchestrates both stages in sequence. `computeVerdict` and `generateNarrative` are removed.

**Tech Stack:** Node.js/Express, TypeScript 5 (ESM), OpenAI SDK, Tavily REST API (native `fetch`), Mongoose 8, Zod 3, Vitest 2.

## Global Constraints

- All imports use `.js` extension even for `.ts` source files (Node ESM + tsc path resolution).
- `type: "module"` in `backend/package.json` — use `import`/`export`, never `require`.
- MongoDB is optional — every code path works when `MONGO_URI` is unset.
- Tavily is optional — if `TAVILY_API_KEY` is missing, `tavilySearch` returns `[]` immediately.
- OpenAI is optional — if no key, `runAiAnalysis` returns the fallback result (maybe / low confidence).
- Test runner: `cd backend && npm test` (Vitest). Run from the `backend/` directory.
- TDD: write the failing test first, verify it fails, implement, verify it passes.
- `VerdictResult`, `AiReasoning`, `MarketObservation` shapes in `shared/types/` must not change.
- Extension code must not need any changes.

---

## File Map

| File | Action |
|---|---|
| `backend/src/marketplace/providers/tavily.ts` | **Create** — Tavily API client, price extraction, save to DB |
| `backend/src/marketplace/priceGathering.ts` | **Create** — Stage 1 orchestrator; replaces `marketContext.ts` |
| `backend/src/ai/aiAnalysis.ts` | **Create** — Stage 2; combined verdict + reasoning OpenAI call |
| `backend/src/analysis/run.ts` | **Modify** — call Stage 1 + Stage 2; remove old imports |
| `backend/.env.example` | **Modify** — add `TAVILY_API_KEY` |
| `backend/src/marketplace/providers/static.ts` | **Delete** |
| `backend/src/marketplace/seed.ts` | **Delete** |
| `backend/src/marketplace/marketContext.ts` | **Delete** |
| `backend/src/analysis/verdict.ts` | **Delete** |
| `backend/src/ai/narrative.ts` | **Delete** |
| `backend/tests/marketContext.test.ts` | **Delete** |
| `backend/tests/verdict.test.ts` | **Delete** |
| `backend/tests/narrative.test.ts` | **Delete** |
| `backend/tests/tavily.test.ts` | **Create** |
| `backend/tests/priceGathering.test.ts` | **Create** |
| `backend/tests/aiAnalysis.test.ts` | **Create** |

---

### Task 1: Tavily price provider

Calls the Tavily API with two queries (Hebrew + English), extracts ILS prices from result snippets using regex, saves found prices to MongoDB as `MarketObservation` records, and returns them. Gracefully returns `[]` when the API key is missing or the call fails.

**Files:**
- Create: `backend/src/marketplace/providers/tavily.ts`
- Create: `backend/tests/tavily.test.ts`

**Interfaces:**
- Consumes: `recordObservations(obs: MarketObservation[]): Promise<number>` from `../marketObservations.js`
- Consumes: `process.env.TAVILY_API_KEY`
- Produces: `tavilySearch(query: { name: string; currency: string }): Promise<MarketObservation[]>`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/tavily.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/tavily.test.ts
```

Expected: FAIL — `Cannot find module '../src/marketplace/providers/tavily.js'`

- [ ] **Step 3: Implement `backend/src/marketplace/providers/tavily.ts`**

```typescript
import type { MarketObservation } from '../../../../shared/types/index.js';
import { recordObservations } from '../marketObservations.js';

const TAVILY_API_URL = 'https://api.tavily.com/search';

const PRICE_REGEX =
  /(?:₪|ש["״]ח|שח|ILS|NIS)\s*([0-9][0-9,]*(?:\.[0-9]+)?)|([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:₪|ש["״]ח|שח|ILS|NIS)/gi;

function extractPrices(text: string): number[] {
  const prices: number[] = [];
  let match: RegExpExecArray | null;
  PRICE_REGEX.lastIndex = 0;
  while ((match = PRICE_REGEX.exec(text)) !== null) {
    const raw = (match[1] ?? match[2]).replace(/,/g, '');
    const value = parseFloat(raw);
    if (Number.isFinite(value) && value > 0 && value < 10_000_000) {
      prices.push(value);
    }
  }
  return prices;
}

interface TavilyResult {
  content?: string;
  snippet?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
  answer?: string;
}

export async function tavilySearch(query: {
  name: string;
  currency: string;
}): Promise<MarketObservation[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const queries = [
    `"${query.name}" יד שנייה מחיר`,
    `"${query.name}" second hand price Israel`,
  ];

  const observations: MarketObservation[] = [];
  const now = new Date();

  for (const q of queries) {
    try {
      const response = await fetch(TAVILY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: q,
          search_depth: 'advanced',
          include_answer: true,
          max_results: 5,
        }),
      });

      if (!response.ok) {
        console.error(`[tavily] HTTP ${response.status} for query: ${q}`);
        continue;
      }

      const data = (await response.json()) as TavilyResponse;
      const texts: string[] = [];
      if (data.answer) texts.push(data.answer);
      for (const result of data.results ?? []) {
        if (result.content) texts.push(result.content);
        if (result.snippet) texts.push(result.snippet);
      }

      for (const text of texts) {
        for (const price of extractPrices(text)) {
          observations.push({
            productName: query.name,
            observedPrice: price,
            currency: query.currency,
            source: 'tavily',
            timestamp: now,
          });
        }
      }
    } catch (err) {
      console.error('[tavily] search failed:', err instanceof Error ? err.message : err);
    }
  }

  if (observations.length > 0) {
    void recordObservations(observations);
  }

  return observations;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/tavily.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
cd /Users/shaishargal/worthIT && git add backend/src/marketplace/providers/tavily.ts backend/tests/tavily.test.ts && git commit -m "feat: add Tavily price provider with ILS price extraction"
```

---

### Task 2: Price gathering orchestrator

Replaces `marketContext.ts`. Queries MongoDB for recent and historical observations; if fewer than 5 recent observations are found, calls `tavilySearch`. Builds `LocalMarketContext` and `HistoricalContext` from gathered data (used in the response shape) and returns recent observations for AI analysis.

**Files:**
- Create: `backend/src/marketplace/priceGathering.ts`
- Create: `backend/tests/priceGathering.test.ts`

**Interfaces:**
- Consumes: `findSimilarObservations(query: ObservationQuery): Promise<MarketObservation[]>` from `./marketObservations.js`
- Consumes: `tavilySearch(query: { name: string; currency: string }): Promise<MarketObservation[]>` from `./providers/tavily.js`
- Consumes: `describePrices(prices: number[]): PriceDistribution | null` from `./statistics.js`
- Consumes: `removeOutliers(prices: number[]): number[]` from `./statistics.js`
- Produces:
  ```typescript
  export type DataSource = 'db' | 'tavily';
  export interface PriceGatheringResult {
    localMarketContext: LocalMarketContext;
    historicalContext: HistoricalContext;
    recentObservations: MarketObservation[];
    sources: DataSource[];
  }
  export async function gatherPrices(query: { name: string; currency: string }): Promise<PriceGatheringResult>
  ```

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/priceGathering.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketObservation } from '../../shared/types/index.js';

vi.mock('../src/marketplace/marketObservations.js', () => ({
  findSimilarObservations: vi.fn(),
}));

vi.mock('../src/marketplace/providers/tavily.js', () => ({
  tavilySearch: vi.fn(),
}));

import { gatherPrices } from '../src/marketplace/priceGathering.js';
import { findSimilarObservations } from '../src/marketplace/marketObservations.js';
import { tavilySearch } from '../src/marketplace/providers/tavily.js';

const findMock = vi.mocked(findSimilarObservations);
const tavilyMock = vi.mocked(tavilySearch);

function obs(price: number, source = 'facebook'): MarketObservation {
  return {
    productName: 'iPhone 13',
    observedPrice: price,
    currency: 'ILS',
    source,
    timestamp: new Date('2026-05-01T00:00:00Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tavilyMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('gatherPrices', () => {
  it('skips Tavily when DB has 5 or more recent observations', async () => {
    const fiveObs = [obs(1900), obs(2000), obs(2100), obs(2050), obs(1950)];
    findMock.mockImplementation(async (q) => (q.sinceDays ? fiveObs : []));

    const result = await gatherPrices({ name: 'iPhone 13', currency: 'ILS' });

    expect(tavilyMock).not.toHaveBeenCalled();
    expect(result.sources).toContain('db');
    expect(result.sources).not.toContain('tavily');
    expect(result.localMarketContext.dataQuality).toBe('real');
  });

  it('calls Tavily when DB has fewer than 5 recent observations', async () => {
    findMock.mockImplementation(async (q) => (q.sinceDays ? [obs(2000)] : []));
    tavilyMock.mockResolvedValue([obs(2100, 'tavily'), obs(1900, 'tavily')]);

    const result = await gatherPrices({ name: 'iPhone 13', currency: 'ILS' });

    expect(tavilyMock).toHaveBeenCalledOnce();
    expect(result.sources).toContain('tavily');
    expect(result.recentObservations.length).toBe(3);
  });

  it('sets dataQuality to seed when only Tavily data found', async () => {
    findMock.mockResolvedValue([]);
    tavilyMock.mockResolvedValue([obs(2000, 'tavily')]);

    const result = await gatherPrices({ name: 'Unknown Product', currency: 'ILS' });

    expect(result.localMarketContext.dataQuality).toBe('seed');
  });

  it('sets dataQuality to insufficient when DB has < 5 real observations and Tavily is empty', async () => {
    findMock.mockImplementation(async (q) => (q.sinceDays ? [obs(2000), obs(1900)] : []));
    tavilyMock.mockResolvedValue([]);

    const result = await gatherPrices({ name: 'iPhone 13', currency: 'ILS' });

    expect(result.localMarketContext.dataQuality).toBe('insufficient');
  });

  it('builds historicalContext from older observations', async () => {
    findMock.mockImplementation(async (q) => {
      if (q.sinceDays) return [];
      if (q.olderThanDays) return [obs(1800), obs(1700)];
      return [];
    });

    const result = await gatherPrices({ name: 'iPhone 13', currency: 'ILS' });

    expect(result.historicalContext.totalObservations).toBe(2);
  });

  it('continues gracefully when Tavily throws', async () => {
    findMock.mockResolvedValue([]);
    tavilyMock.mockRejectedValue(new Error('Tavily down'));

    const result = await gatherPrices({ name: 'Guitar', currency: 'ILS' });

    expect(result.recentObservations).toEqual([]);
    expect(result.localMarketContext.dataQuality).toBe('insufficient');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/priceGathering.test.ts
```

Expected: FAIL — `Cannot find module '../src/marketplace/priceGathering.js'`

- [ ] **Step 3: Implement `backend/src/marketplace/priceGathering.ts`**

```typescript
import type {
  HistoricalContext,
  LocalMarketContext,
  MarketObservation,
} from '../../../shared/types/index.js';
import { findSimilarObservations } from './marketObservations.js';
import { tavilySearch } from './providers/tavily.js';
import { describePrices, removeOutliers } from './statistics.js';

const RECENT_WINDOW_DAYS = 90;
const RECENT_LIMIT = 30;
const HISTORICAL_LIMIT = 50;
const TAVILY_THRESHOLD = 5;

export type DataSource = 'db' | 'tavily';

export interface PriceGatheringResult {
  localMarketContext: LocalMarketContext;
  historicalContext: HistoricalContext;
  recentObservations: MarketObservation[];
  sources: DataSource[];
}

function round(n: number): number {
  return Math.round(n);
}

function buildDataQuality(
  dbCount: number,
  tavilyCount: number,
): 'real' | 'seed' | 'insufficient' {
  if (dbCount >= TAVILY_THRESHOLD) return 'real';
  if (dbCount === 0 && tavilyCount === 0) return 'insufficient';
  if (dbCount === 0 && tavilyCount > 0) return 'seed';
  return 'insufficient';
}

function buildLocalContext(
  query: string,
  currency: string,
  observations: MarketObservation[],
  dataQuality: 'real' | 'seed' | 'insufficient',
  notes: string[],
): LocalMarketContext {
  const prices = observations
    .map((o) => o.observedPrice)
    .filter((p) => Number.isFinite(p) && p > 0);
  const cleaned = removeOutliers(prices);
  const usable = cleaned.length > 0 ? cleaned : prices;
  const dist = describePrices(usable);

  return {
    query,
    currency,
    observationCount: observations.length,
    dataQuality,
    priceRange: dist ? { min: round(dist.min), max: round(dist.max) } : undefined,
    typicalPrice: dist
      ? { p25: round(dist.p25), p50: round(dist.p50), p75: round(dist.p75) }
      : undefined,
    recentObservations: observations.slice(0, RECENT_LIMIT),
    notes,
  };
}

function buildHistoricalContext(
  query: string,
  observations: MarketObservation[],
): HistoricalContext {
  if (observations.length === 0) {
    return { query, totalObservations: 0, observations: [] };
  }
  let oldest = observations[0].timestamp;
  let newest = observations[0].timestamp;
  for (const o of observations) {
    if (o.timestamp < oldest) oldest = o.timestamp;
    if (o.timestamp > newest) newest = o.timestamp;
  }
  return {
    query,
    totalObservations: observations.length,
    oldestTimestamp: oldest,
    newestTimestamp: newest,
    observations: observations.slice(0, HISTORICAL_LIMIT),
  };
}

export async function gatherPrices(query: {
  name: string;
  currency: string;
}): Promise<PriceGatheringResult> {
  const currency = query.currency.trim().toUpperCase();
  const notes: string[] = [];
  const sources: DataSource[] = [];

  const [recentDb, historicalDb] = await Promise.all([
    findSimilarObservations({
      name: query.name,
      currency,
      sinceDays: RECENT_WINDOW_DAYS,
      limit: RECENT_LIMIT,
    }),
    findSimilarObservations({
      name: query.name,
      currency,
      olderThanDays: RECENT_WINDOW_DAYS,
      limit: HISTORICAL_LIMIT,
    }),
  ]);

  if (recentDb.length > 0) sources.push('db');

  let recent = recentDb;
  let tavilyCount = 0;

  if (recentDb.length < TAVILY_THRESHOLD) {
    const tavilyObs = await tavilySearch({ name: query.name, currency }).catch((err) => {
      console.error('[priceGathering] tavily failed:', err instanceof Error ? err.message : err);
      return [] as MarketObservation[];
    });

    if (tavilyObs.length > 0) {
      recent = [...recentDb, ...tavilyObs];
      tavilyCount = tavilyObs.length;
      sources.push('tavily');
      notes.push('Prices sourced from web search — verify independently.');
    }
  }

  if (recent.length === 0) {
    notes.push('No market data found for this product.');
  }

  const dataQuality = buildDataQuality(recentDb.length, tavilyCount);
  const localMarketContext = buildLocalContext(query.name, currency, recent, dataQuality, notes);
  const historicalContext = buildHistoricalContext(query.name, historicalDb);

  return { localMarketContext, historicalContext, recentObservations: recent, sources };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/priceGathering.test.ts
```

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
cd /Users/shaishargal/worthIT && git add backend/src/marketplace/priceGathering.ts backend/tests/priceGathering.test.ts && git commit -m "feat: add priceGathering orchestrator (DB + Tavily, replaces marketContext)"
```

---

### Task 3: AI analysis — combined verdict and reasoning

Replaces `verdict.ts` and `narrative.ts` with a single OpenAI call. Receives the listing, condition result, gathered price observations, and data sources. Returns `VerdictResult` and `AiReasoning` in one structured JSON response. Returns a safe fallback when OpenAI is unavailable.

**Files:**
- Create: `backend/src/ai/aiAnalysis.ts`
- Create: `backend/tests/aiAnalysis.test.ts`

**Interfaces:**
- Consumes: `getOpenAiClient(): OpenAI | null` from `./client.js`
- Consumes: `getOpenAiModel(): string` from `./client.js`
- Consumes: `ConditionResult` from `./condition.js`
- Consumes: `DataSource` from `../marketplace/priceGathering.js`
- Produces:
  ```typescript
  export interface AiAnalysisInput {
    listing: ListingSnapshot;
    condition: ConditionResult;
    recentObservations: MarketObservation[];
    sources: DataSource[];
  }
  export interface AiAnalysisResult {
    verdict: VerdictResult;
    reasoning: AiReasoning;
  }
  export async function runAiAnalysis(input: AiAnalysisInput): Promise<AiAnalysisResult>
  ```

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/aiAnalysis.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketObservation } from '../../shared/types/index.js';

vi.mock('../src/ai/client.js', () => ({
  getOpenAiClient: vi.fn(),
  getOpenAiModel: vi.fn().mockReturnValue('gpt-4o-mini'),
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/aiAnalysis.test.ts
```

Expected: FAIL — `Cannot find module '../src/ai/aiAnalysis.js'`

- [ ] **Step 3: Implement `backend/src/ai/aiAnalysis.ts`**

```typescript
import { z } from 'zod';
import type { AiReasoning, MarketObservation, VerdictResult } from '../../../shared/types/index.js';
import type { ListingSnapshot } from '../../../shared/types/index.js';
import type { ConditionResult } from './condition.js';
import { getOpenAiClient, getOpenAiModel } from './client.js';
import type { DataSource } from '../marketplace/priceGathering.js';

export interface AiAnalysisInput {
  listing: ListingSnapshot;
  condition: ConditionResult;
  recentObservations: MarketObservation[];
  sources: DataSource[];
}

export interface AiAnalysisResult {
  verdict: VerdictResult;
  reasoning: AiReasoning;
}

const SYSTEM_PROMPT = `You are a deal analyst for the Israeli second-hand marketplace. Decide if a listing is worth buying.

Return JSON ONLY in this exact schema:
{
  "verdict": "worth_it" | "maybe" | "avoid",
  "worthRating": integer 1 to 5,
  "confidence": number 0.0 to 1.0,
  "confidenceLevel": "low" | "medium" | "high",
  "summary": "1-2 plain sentences, friend tone, max 40 words",
  "positives": ["short phrase", "short phrase"],
  "concerns": ["short phrase", "short phrase"]
}

Rules:
- verdict: worth_it = great deal, maybe = fair price, avoid = overpriced
- worthRating: 5 = excellent deal, 4 = good, 3 = fair, 2 = slightly overpriced, 1 = clearly avoid
- confidence and confidenceLevel must be consistent: low < 0.4, medium 0.4–0.7, high > 0.7
- Set confidence based on data: low if fewer than 3 price points, medium if 3–9, high if 10+
- positives: 2-3 short bullet reasons it is a good deal. Empty array [] if verdict is "avoid".
- concerns: 2-3 short bullet reasons to be careful. Empty array [] if verdict is "worth_it" and data is from real DB observations.
- If data came from web search only (sources includes tavily but not db), always add "Limited listings to compare — verify independently" to concerns.
- NEVER use these words: p50, percentile, observation, ILS, deterministic, confidence score.
- Output JSON only, no commentary.`;

const analysisSchema = z.object({
  verdict: z.enum(['worth_it', 'maybe', 'avoid']),
  worthRating: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  confidenceLevel: z.enum(['low', 'medium', 'high']),
  summary: z.string().min(1),
  positives: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
});

const FALLBACK_RESULT: AiAnalysisResult = {
  verdict: {
    verdict: 'maybe',
    worthRating: 3,
    confidence: 0.1,
    confidenceLevel: 'low',
  },
  reasoning: {
    summary: 'Could not fully analyze this listing. Check similar listings to compare pricing.',
    positives: [],
    concerns: ['Limited data available — verify the price independently'],
  },
};

function formatObservations(observations: MarketObservation[]): string {
  if (observations.length === 0) return '(no price data found)';
  return observations
    .slice(0, 15)
    .map((o) => {
      const when = o.timestamp.toISOString().slice(0, 10);
      return `- ${when} | ${o.source} | ${o.observedPrice} ${o.currency}`;
    })
    .join('\n');
}

function buildUserPrompt(input: AiAnalysisInput): string {
  const { listing, condition, recentObservations, sources } = input;
  const sourceStr = sources.length > 0 ? sources.join(' + ') : 'none';
  const conditionDetail =
    condition.signals.length > 0
      ? `${condition.conditionLabel} — ${condition.signals.join(', ')}`
      : condition.conditionLabel;

  return [
    'LISTING:',
    `- title: ${listing.title}`,
    `- asking price: ${listing.price} ${listing.currency}`,
    `- description: ${listing.description ?? '(none)'}`,
    '',
    `CONDITION: ${conditionDetail} (score: ${condition.conditionScore.toFixed(2)})`,
    '',
    `MARKET DATA (sources: ${sourceStr}, ${recentObservations.length} price points):`,
    formatObservations(recentObservations),
    '',
    'Decide if this listing is worth buying. Return JSON only.',
  ].join('\n');
}

export async function runAiAnalysis(input: AiAnalysisInput): Promise<AiAnalysisResult> {
  const openai = getOpenAiClient();
  if (!openai) return FALLBACK_RESULT;

  try {
    const completion = await openai.chat.completions.create({
      model: getOpenAiModel(),
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(input) },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = analysisSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      console.error('[aiAnalysis] malformed JSON:', parsed.error.message);
      return FALLBACK_RESULT;
    }

    return {
      verdict: {
        verdict: parsed.data.verdict,
        worthRating: parsed.data.worthRating,
        confidence: parsed.data.confidence,
        confidenceLevel: parsed.data.confidenceLevel,
      },
      reasoning: {
        summary: parsed.data.summary,
        positives: parsed.data.positives.slice(0, 8),
        concerns: parsed.data.concerns.slice(0, 8),
      },
    };
  } catch (err) {
    console.error('[aiAnalysis] OpenAI failed:', err instanceof Error ? err.message : err);
    return FALLBACK_RESULT;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/aiAnalysis.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
cd /Users/shaishargal/worthIT && git add backend/src/ai/aiAnalysis.ts backend/tests/aiAnalysis.test.ts && git commit -m "feat: add AI analysis — combined verdict and reasoning in one OpenAI call"
```

---

### Task 4: Wire run.ts, delete old files, update env

Update `run.ts` to call Stage 1 (`gatherPrices`) and Stage 2 (`runAiAnalysis`). Delete the five files that are no longer used. Remove the three test files that tested deleted code. Update `.env.example`. Run the full test suite to confirm everything is green.

**Files:**
- Modify: `backend/src/analysis/run.ts`
- Modify: `backend/.env.example`
- Delete: `backend/src/analysis/verdict.ts`
- Delete: `backend/src/ai/narrative.ts`
- Delete: `backend/src/marketplace/providers/static.ts`
- Delete: `backend/src/marketplace/seed.ts`
- Delete: `backend/src/marketplace/marketContext.ts`
- Delete: `backend/tests/verdict.test.ts`
- Delete: `backend/tests/narrative.test.ts`
- Delete: `backend/tests/marketContext.test.ts`

**Interfaces:**
- Consumes: `gatherPrices` from `../marketplace/priceGathering.js`
- Consumes: `runAiAnalysis` from `../ai/aiAnalysis.js`
- Consumes: `analyzeCondition` from `../ai/condition.js` (unchanged)
- Consumes: `getCachedAnalysis`, `listingFingerprint`, `setCachedAnalysis` from `../cache/analysisCache.js` (unchanged)
- Consumes: `buildAnalysisId`, `saveAnalysis` from `./analysisRepository.js` (unchanged)
- Consumes: `recordObservations` from `../marketplace/marketObservations.js` (unchanged)

- [ ] **Step 1: Replace `backend/src/analysis/run.ts`**

Replace the entire file with:

```typescript
import type { AnalyzeProductResponse, ListingSnapshot, ProductInput } from '../../../shared/types/index.js';
import { analyzeCondition } from '../ai/condition.js';
import { runAiAnalysis } from '../ai/aiAnalysis.js';
import { getCachedAnalysis, listingFingerprint, setCachedAnalysis } from '../cache/analysisCache.js';
import { gatherPrices } from '../marketplace/priceGathering.js';
import { recordObservations } from '../marketplace/marketObservations.js';
import { buildAnalysisId, saveAnalysis } from './analysisRepository.js';

function normalizeCurrency(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (upper === 'NIS' || upper === '₪') return 'ILS';
  return upper.slice(0, 8);
}

export function productToListing(product: ProductInput): ListingSnapshot {
  return {
    title: product.title.trim(),
    price: product.price,
    currency: normalizeCurrency(product.currency),
    description: product.description,
    imageUrl: product.image,
    url: product.url,
    source: 'facebook',
    observedAt: new Date(),
  };
}

export async function runProductAnalysis(product: ProductInput): Promise<AnalyzeProductResponse> {
  const listing = productToListing(product);
  const cacheKey = listingFingerprint(listing);

  const cached = getCachedAnalysis(cacheKey);
  if (cached) return cached;

  const [priceData, condition] = await Promise.all([
    gatherPrices({ name: listing.title, currency: listing.currency }),
    analyzeCondition({ title: listing.title, description: listing.description, imageUrl: listing.imageUrl }),
  ]);

  const { verdict, reasoning } = await runAiAnalysis({
    listing,
    condition,
    recentObservations: priceData.recentObservations,
    sources: priceData.sources,
  });

  const response: AnalyzeProductResponse = {
    analysisId: buildAnalysisId(),
    listing,
    localMarketContext: priceData.localMarketContext,
    historicalContext: priceData.historicalContext,
    verdict,
    reasoning,
  };

  setCachedAnalysis(cacheKey, response);
  void saveAnalysis(response.analysisId, response);
  void recordObservations([{
    productName: listing.title,
    observedPrice: listing.price,
    currency: listing.currency,
    source: listing.source ?? 'facebook',
    timestamp: listing.observedAt,
  }]);

  return response;
}
```

- [ ] **Step 2: Add `TAVILY_API_KEY` to `.env.example`**

Open `backend/.env.example` and add after `OPENAI_VISION=false`:

```
TAVILY_API_KEY=
```

Also remove the `MARKET_DATA_PROVIDER=static` line since the env var is no longer used.

The final `backend/.env.example` should be:

```
PORT=4000
LLM_API_KEY=
MONGO_URI=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_VISION=false
TAVILY_API_KEY=
JWT_SECRET=change-me-in-production
```

- [ ] **Step 3: Delete the five source files that are no longer used**

```bash
rm /Users/shaishargal/worthIT/backend/src/analysis/verdict.ts
rm /Users/shaishargal/worthIT/backend/src/ai/narrative.ts
rm /Users/shaishargal/worthIT/backend/src/marketplace/providers/static.ts
rm /Users/shaishargal/worthIT/backend/src/marketplace/seed.ts
rm /Users/shaishargal/worthIT/backend/src/marketplace/marketContext.ts
```

- [ ] **Step 4: Delete the three test files for deleted code**

```bash
rm /Users/shaishargal/worthIT/backend/tests/verdict.test.ts
rm /Users/shaishargal/worthIT/backend/tests/narrative.test.ts
rm /Users/shaishargal/worthIT/backend/tests/marketContext.test.ts
```

- [ ] **Step 5: Run the full test suite**

```bash
cd /Users/shaishargal/worthIT/backend && npm test
```

Expected: PASS — all remaining tests green (tavily, priceGathering, aiAnalysis, app, analysisRepository, auth, usage, condition, statistics).

If any test fails because it imports a deleted file, remove that import and the related test case — the behaviour is now covered by the new tests.

- [ ] **Step 6: Run typecheck**

```bash
cd /Users/shaishargal/worthIT/backend && npx tsc --noEmit
```

Expected: no errors. If TypeScript complains about a missing import from a deleted file, find and remove it.

- [ ] **Step 7: Commit**

```bash
cd /Users/shaishargal/worthIT
git add backend/src/analysis/run.ts backend/.env.example
git rm backend/src/analysis/verdict.ts backend/src/ai/narrative.ts backend/src/marketplace/providers/static.ts backend/src/marketplace/seed.ts backend/src/marketplace/marketContext.ts
git rm backend/tests/verdict.test.ts backend/tests/narrative.test.ts backend/tests/marketContext.test.ts
git commit -m "feat: wire AI price pipeline — Tavily + DB → AI verdict, remove deterministic formula"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| Tavily provider (two queries, price extraction, save to DB) | Task 1 |
| Skip Tavily when DB has ≥ 5 observations | Task 2 |
| `dataQuality: seed` when only Tavily data | Task 2 |
| `dataQuality: real` when DB has ≥ 5 real observations | Task 2 |
| AI decides full verdict (not deterministic formula) | Task 3 |
| AI receives listing + condition + observations + sources | Task 3 |
| Fallback result when OpenAI unavailable | Task 3 |
| `VerdictResult` and `AiReasoning` shapes unchanged | Tasks 3, 4 |
| Response still includes `localMarketContext` and `historicalContext` | Task 2 (returned from `gatherPrices`) |
| Extension needs zero changes | Verified — `AnalyzeProductResponse` shape unchanged |
| `verdict.ts`, `narrative.ts`, `static.ts`, `seed.ts`, `marketContext.ts` deleted | Task 4 |
| `TAVILY_API_KEY` in `.env.example` | Task 4 |
| MongoDB optional (graceful when not connected) | All tasks (existing `isMongoReady()` guards) |
| Tavily optional (graceful when key missing) | Task 1 (early return) |
| OpenAI optional (fallback result) | Task 3 (FALLBACK_RESULT) |

### Type consistency check

- `gatherPrices` returns `PriceGatheringResult` with `recentObservations: MarketObservation[]` and `sources: DataSource[]` — consumed in `run.ts` as `priceData.recentObservations` and `priceData.sources`. ✓
- `runAiAnalysis` takes `AiAnalysisInput` with `recentObservations: MarketObservation[]` and `sources: DataSource[]` — matches what `run.ts` passes. ✓
- `DataSource = 'db' | 'tavily'` — exported from `priceGathering.ts`, imported in `aiAnalysis.ts`. ✓
- `AiAnalysisResult.verdict` is `VerdictResult` — used directly as `response.verdict`. ✓
- `AiAnalysisResult.reasoning` is `AiReasoning` — used directly as `response.reasoning`. ✓
- `ConditionResult` imported from `./condition.js` in both `aiAnalysis.ts` (interface) and `run.ts` (via `analyzeCondition`). ✓
