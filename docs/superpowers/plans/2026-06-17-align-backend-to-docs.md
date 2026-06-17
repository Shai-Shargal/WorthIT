# WorthIT Backend — Align to Documentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken backend (app won't start), migrate the main endpoint to the doc-specified path, and implement analysis persistence, auth stub, and usage tracking so the project matches its own documentation.

**Architecture:** The three missing route files (`analysis.route.ts`, `auth.route.ts`, `user.route.ts`) are imported by `app.ts` but don't exist — that's why the server crashes on startup. Once the files exist, we add a MongoDB `Analysis` model so results can be stored and retrieved by ID, record each analyzed listing as a market observation so the DB grows over time, and stub out auth (JWT) and usage tracking per the API design doc.

**Tech Stack:** Express 4, TypeScript 5 (ESM), Mongoose 8, Zod 3, Vitest 2, `jsonwebtoken` (new), `uuid` (new), `supertest` (existing dev dep).

## Global Constraints

- All imports use `.js` extension even for `.ts` source files (Node ESM + tsc path resolution).
- `type: "module"` is set in `backend/package.json` — use `import`/`export`, never `require`.
- MongoDB is **optional** — every route must return a useful response even when `MONGO_URI` is unset.
- Verdict is always deterministic (computed in `verdict.ts`) — the LLM only narrates.
- No hardcoded secrets; all credentials come from `process.env`.
- Test runner: `cd backend && npm test` (Vitest). Integration tests use `supertest`.

---

### Task 1: Fix broken app startup — create three missing route stubs

`app.ts` imports `./analysis/analysis.route.js`, `./auth/auth.route.js`, and `./usage/user.route.js`. None exist. The server crashes before handling any request.

**Files:**
- Create: `backend/src/analysis/analysis.route.ts`
- Create: `backend/src/auth/auth.route.ts`
- Create: `backend/src/usage/user.route.ts`
- Create: `backend/tests/app.test.ts`

**Interfaces:**
- Produces: `analysisRouter` (Router), `authRouter` (Router), `userRouter` (Router) — imported by `app.ts`

- [ ] **Step 1: Write the failing integration test**

Create `backend/tests/app.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('app startup', () => {
  it('GET /health returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /auth/google returns 501 (stub)', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/google').send({ googleToken: 'x' });
    expect(res.status).toBe(501);
  });

  it('GET /analysis/some-id returns 404 or 501 (stub)', async () => {
    const app = createApp();
    const res = await request(app).get('/analysis/nonexistent-id');
    expect([404, 501]).toContain(res.status);
  });

  it('GET /user/usage returns 501 (stub)', async () => {
    const app = createApp();
    const res = await request(app).get('/user/usage');
    expect(res.status).toBe(501);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/app.test.ts
```

Expected: FAIL — `Cannot find module '../src/analysis/analysis.route.js'`

- [ ] **Step 3: Create `backend/src/auth/auth.route.ts`**

```typescript
import { Router } from 'express';

export const authRouter = Router();

authRouter.post('/google', (_req, res) => {
  res.status(501).json({ error: 'Auth not yet implemented' });
});
```

- [ ] **Step 4: Create `backend/src/analysis/analysis.route.ts`**

```typescript
import { Router } from 'express';

export const analysisRouter = Router();

analysisRouter.post('/analyze', (_req, res) => {
  res.status(501).json({ error: 'Not yet implemented' });
});

analysisRouter.get('/:id', (_req, res) => {
  res.status(501).json({ error: 'Not yet implemented' });
});
```

- [ ] **Step 5: Create `backend/src/usage/user.route.ts`**

```typescript
import { Router } from 'express';

export const userRouter = Router();

userRouter.get('/usage', (_req, res) => {
  res.status(501).json({ error: 'Not yet implemented' });
});
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/app.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 7: Verify the server actually starts**

```bash
cd /Users/shaishargal/worthIT/backend && npm run dev &
sleep 3 && curl http://localhost:4000/health
kill %1
```

Expected: `{"status":"ok","db":{"connected":false,"error":"Missing MONGO_URI env var"}}`

- [ ] **Step 8: Commit**

```bash
cd /Users/shaishargal/worthIT
git add backend/src/analysis/analysis.route.ts backend/src/auth/auth.route.ts backend/src/usage/user.route.ts backend/tests/app.test.ts
git commit -m "fix: create missing route stubs so app starts"
```

---

### Task 2: Migrate main analysis endpoint to /analysis/analyze

The docs spec the main endpoint as `POST /analysis/analyze`. The current code uses `POST /analyze-product` (a top-level route). Both the shared constant and the extension `api.ts` need to update.

**Files:**
- Modify: `shared/constants/index.ts` — change `ANALYZE_PRODUCT_PATH` to `/analysis/analyze`
- Modify: `backend/src/analysis/analysis.route.ts` — implement `POST /analyze` with the full validation + `runProductAnalysis` call
- Modify: `backend/src/app.ts` — remove the old `analyzeProductRouter` mount
- Modify: `backend/src/analysis/analyzeProduct.route.ts` — delete its content (keep empty or remove import from app.ts)

**Interfaces:**
- Consumes: `runProductAnalysis(product: ProductInput): Promise<AnalyzeProductResponse>` from `./run.js`
- Consumes: Zod `productSchema` — validate `title`, `price`, `currency`, optional `description`, `url`, `image`
- Produces: `POST /analysis/analyze` → `200 AnalyzeProductResponse` | `400 { error: string }`

- [ ] **Step 1: Update shared constant**

Edit `shared/constants/index.ts`:

```typescript
export const ANALYZE_PRODUCT_PATH = '/analysis/analyze';

export const DEFAULT_API_BASE = 'http://localhost:4000';
```

- [ ] **Step 2: Write the failing route test**

Add to `backend/tests/app.test.ts`:

```typescript
it('POST /analysis/analyze with valid body returns 200', async () => {
  const app = createApp();
  const res = await request(app)
    .post('/analysis/analyze')
    .send({ title: 'iPhone 13', price: 1500, currency: 'ILS' });
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('verdict');
  expect(res.body).toHaveProperty('reasoning');
});

it('POST /analysis/analyze with missing price returns 400', async () => {
  const app = createApp();
  const res = await request(app)
    .post('/analysis/analyze')
    .send({ title: 'iPhone 13', currency: 'ILS' });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/app.test.ts
```

Expected: FAIL — POST /analysis/analyze still returns 501.

- [ ] **Step 4: Implement `POST /analyze` in `analysis.route.ts`**

Replace the stub in `backend/src/analysis/analysis.route.ts` with:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { runProductAnalysis } from './run.js';

export const analysisRouter = Router();

const productSchema = z.object({
  title: z.string().trim().min(1).max(300),
  price: z.number().finite().positive(),
  currency: z.string().trim().min(1).max(8),
  description: z.string().trim().max(5000).optional(),
  url: z.string().url().optional(),
  image: z.string().url().optional(),
});

analysisRouter.post('/analyze', async (req, res, next) => {
  try {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const message =
        flat.fieldErrors.title?.[0] ??
        flat.fieldErrors.price?.[0] ??
        flat.fieldErrors.currency?.[0] ??
        flat.formErrors[0] ??
        'Invalid request body';
      return res.status(400).json({ error: message });
    }
    const result = await runProductAnalysis(parsed.data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

analysisRouter.get('/:id', (_req, res) => {
  res.status(501).json({ error: 'Not yet implemented' });
});
```

- [ ] **Step 5: Update `app.ts` — remove old router**

Edit `backend/src/app.ts`. Remove the two lines that reference `analyzeProductRouter`:

```typescript
import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { analysisRouter } from './analysis/analysis.route.js';
import { authRouter } from './auth/auth.route.js';
import { mongoStatus } from './database/mongoose.js';
import { userRouter } from './usage/user.route.js';

export function createApp(): Application {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', db: mongoStatus() });
  });
  app.use('/auth', authRouter);
  app.use('/analysis', analysisRouter);
  app.use('/user', userRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const statusFromErr = (err as { status?: number })?.status;
    const status =
      typeof statusFromErr === 'number' && statusFromErr >= 400 && statusFromErr < 600
        ? statusFromErr
        : 500;
    if (status >= 500) {
      console.error('[worthit-backend] unhandled error:', err);
    }
    res.status(status).json({ error: message });
  });

  return app;
}
```

- [ ] **Step 6: Run all tests**

```bash
cd /Users/shaishargal/worthIT/backend && npm test
```

Expected: PASS — all existing tests + new tests green. The old `analyzeProduct.route.ts` is no longer imported so it won't cause errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/shaishargal/worthIT
git add shared/constants/index.ts backend/src/app.ts backend/src/analysis/analysis.route.ts backend/tests/app.test.ts
git commit -m "feat: migrate main endpoint to POST /analysis/analyze per API docs"
```

---

### Task 3: Analysis MongoDB model + persistence + analysisId in response

Analyzed results currently live only in the 1h in-memory cache. After eviction they're lost. The docs say to store analyzed products with a retrievable `analysisId`.

**Files:**
- Create: `backend/src/database/models/Analysis.ts`
- Create: `backend/src/analysis/analysisRepository.ts`
- Modify: `backend/src/analysis/run.ts` — generate `analysisId`, persist to DB, return it in response
- Modify: `shared/types/analysis.ts` — add `analysisId: string` to `AnalyzeProductResponse`

**Interfaces:**
- Consumes: `mongoose.connection.readyState` to guard DB calls
- Produces:
  - `saveAnalysis(id: string, result: AnalyzeProductResponse): Promise<void>`
  - `findAnalysisById(id: string): Promise<StoredAnalysis | null>`
  - `AnalyzeProductResponse` now includes `analysisId: string`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/analysisRepository.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildAnalysisId, saveAnalysis, findAnalysisById } from '../src/analysis/analysisRepository.js';
import type { AnalyzeProductResponse } from '../../shared/types/index.js';

function makeResponse(): AnalyzeProductResponse {
  return {
    analysisId: 'test-id-123',
    listing: { title: 'iPhone 13', price: 1500, currency: 'ILS', observedAt: new Date() },
    localMarketContext: { query: 'iPhone 13', currency: 'ILS', observationCount: 0, recentObservations: [], notes: [] },
    historicalContext: { query: 'iPhone 13', totalObservations: 0, observations: [] },
    verdict: { verdict: 'maybe', worthRating: 3, confidence: 0.1, confidenceLevel: 'low' },
    reasoning: { summary: 'Test', positives: [], concerns: [] },
  };
}

describe('analysisRepository', () => {
  it('buildAnalysisId returns a non-empty string', () => {
    const id = buildAnalysisId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('findAnalysisById returns null when mongo is not connected', async () => {
    const result = await findAnalysisById('any-id');
    expect(result).toBeNull();
  });

  it('saveAnalysis does not throw when mongo is not connected', async () => {
    await expect(saveAnalysis('any-id', makeResponse())).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/analysisRepository.test.ts
```

Expected: FAIL — `Cannot find module '../src/analysis/analysisRepository.js'`

- [ ] **Step 3: Add `analysisId` to shared type**

Edit `shared/types/analysis.ts` — add `analysisId` at the top of `AnalyzeProductResponse`:

```typescript
import type { HistoricalContext, LocalMarketContext } from './market.js';
import type { ListingSnapshot } from './product.js';

export type Verdict = 'worth_it' | 'maybe' | 'avoid';

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface EstimatedValueRange {
  min: number;
  max: number;
  currency: string;
}

export interface VerdictResult {
  verdict: Verdict;
  worthRating: number;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  estimatedValue?: EstimatedValueRange;
}

export interface AiReasoning {
  summary: string;
  positives: string[];
  concerns: string[];
}

export interface AnalyzeProductResponse {
  analysisId: string;
  listing: ListingSnapshot;
  localMarketContext: LocalMarketContext;
  historicalContext: HistoricalContext;
  verdict: VerdictResult;
  reasoning: AiReasoning;
}
```

- [ ] **Step 4: Create `backend/src/database/models/Analysis.ts`**

```typescript
import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const analysisSchema = new Schema(
  {
    analysisId: { type: String, required: true, unique: true, index: true },
    listing: { type: Schema.Types.Mixed, required: true },
    verdict: { type: Schema.Types.Mixed, required: true },
    reasoning: { type: Schema.Types.Mixed, required: true },
    localMarketContext: { type: Schema.Types.Mixed },
    historicalContext: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: () => new Date(), index: true },
  },
  { collection: 'analyses', versionKey: false },
);

export type AnalysisDoc = InferSchemaType<typeof analysisSchema>;

export const AnalysisModel =
  mongoose.models.Analysis ?? mongoose.model('Analysis', analysisSchema);
```

- [ ] **Step 5: Create `backend/src/analysis/analysisRepository.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AnalysisModel } from '../database/models/Analysis.js';
import type { AnalyzeProductResponse } from '../../../shared/types/index.js';

function isMongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export function buildAnalysisId(): string {
  return randomUUID();
}

export async function saveAnalysis(id: string, result: AnalyzeProductResponse): Promise<void> {
  if (!isMongoReady()) return;
  try {
    await AnalysisModel.updateOne(
      { analysisId: id },
      {
        analysisId: id,
        listing: result.listing,
        verdict: result.verdict,
        reasoning: result.reasoning,
        localMarketContext: result.localMarketContext,
        historicalContext: result.historicalContext,
      },
      { upsert: true },
    );
  } catch (err) {
    console.error('[analysisRepository] save failed:', err instanceof Error ? err.message : err);
  }
}

export async function findAnalysisById(id: string): Promise<AnalyzeProductResponse | null> {
  if (!isMongoReady()) return null;
  try {
    const doc = await AnalysisModel.findOne({ analysisId: id }).lean().exec();
    if (!doc) return null;
    return {
      analysisId: doc.analysisId as string,
      listing: doc.listing as AnalyzeProductResponse['listing'],
      verdict: doc.verdict as AnalyzeProductResponse['verdict'],
      reasoning: doc.reasoning as AnalyzeProductResponse['reasoning'],
      localMarketContext: doc.localMarketContext as AnalyzeProductResponse['localMarketContext'],
      historicalContext: doc.historicalContext as AnalyzeProductResponse['historicalContext'],
    };
  } catch (err) {
    console.error('[analysisRepository] findById failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
```

- [ ] **Step 6: Update `run.ts` to generate ID and persist**

Edit `backend/src/analysis/run.ts` — add `analysisId` generation, pass it into result, and save to DB:

```typescript
import type { AnalyzeProductResponse, ListingSnapshot, ProductInput } from '../../../shared/types/index.js';
import { analyzeCondition } from '../ai/condition.js';
import { generateNarrative } from '../ai/narrative.js';
import { getCachedAnalysis, listingFingerprint, setCachedAnalysis } from '../cache/analysisCache.js';
import { buildMarketContexts } from '../marketplace/marketContext.js';
import { buildAnalysisId, saveAnalysis } from './analysisRepository.js';
import { computeVerdict } from './verdict.js';

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

  const { localMarketContext, historicalContext } = await buildMarketContexts({
    name: listing.title,
    currency: listing.currency,
  });

  const condition = await analyzeCondition({
    title: listing.title,
    description: listing.description,
    imageUrl: listing.imageUrl,
  });

  const verdict = computeVerdict({ listing, localMarketContext });

  const reasoning = await generateNarrative({
    listing,
    localMarketContext,
    historicalContext,
    verdict,
    condition,
  });

  const response: AnalyzeProductResponse = {
    analysisId: buildAnalysisId(),
    listing,
    localMarketContext,
    historicalContext,
    verdict,
    reasoning,
  };

  setCachedAnalysis(cacheKey, response);
  void saveAnalysis(response.analysisId, response);
  return response;
}
```

- [ ] **Step 7: Run all tests**

```bash
cd /Users/shaishargal/worthIT/backend && npm test
```

Expected: PASS. The `analysisId` field now appears in all responses.

- [ ] **Step 8: Commit**

```bash
cd /Users/shaishargal/worthIT
git add shared/types/analysis.ts backend/src/database/models/Analysis.ts backend/src/analysis/analysisRepository.ts backend/src/analysis/run.ts backend/tests/analysisRepository.test.ts
git commit -m "feat: add Analysis MongoDB model and persist results with UUID analysisId"
```

---

### Task 4: Implement GET /analysis/:id — detailed analysis retrieval

The API design doc defines `GET /analysis/:id` to return full analysis details. Now that `analysisRepository.findAnalysisById` exists, wire it into the route.

**Files:**
- Modify: `backend/src/analysis/analysis.route.ts` — replace the `:id` stub with a real handler

**Interfaces:**
- Consumes: `findAnalysisById(id: string): Promise<AnalyzeProductResponse | null>` from `./analysisRepository.js`
- Produces: `200 AnalyzeProductResponse` | `404 { error: "Analysis not found" }`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/app.test.ts`:

```typescript
it('GET /analysis/:id returns 404 for unknown id', async () => {
  const app = createApp();
  const res = await request(app).get('/analysis/00000000-0000-0000-0000-000000000000');
  expect(res.status).toBe(404);
  expect(res.body.error).toBe('Analysis not found');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/app.test.ts
```

Expected: FAIL — endpoint still returns 501.

- [ ] **Step 3: Implement the handler in `analysis.route.ts`**

Replace the `/:id` stub handler:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { findAnalysisById } from './analysisRepository.js';
import { runProductAnalysis } from './run.js';

export const analysisRouter = Router();

const productSchema = z.object({
  title: z.string().trim().min(1).max(300),
  price: z.number().finite().positive(),
  currency: z.string().trim().min(1).max(8),
  description: z.string().trim().max(5000).optional(),
  url: z.string().url().optional(),
  image: z.string().url().optional(),
});

analysisRouter.post('/analyze', async (req, res, next) => {
  try {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const message =
        flat.fieldErrors.title?.[0] ??
        flat.fieldErrors.price?.[0] ??
        flat.fieldErrors.currency?.[0] ??
        flat.formErrors[0] ??
        'Invalid request body';
      return res.status(400).json({ error: message });
    }
    const result = await runProductAnalysis(parsed.data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

analysisRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await findAnalysisById(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/shaishargal/worthIT/backend && npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/shaishargal/worthIT
git add backend/src/analysis/analysis.route.ts backend/tests/app.test.ts
git commit -m "feat: implement GET /analysis/:id for detailed analysis retrieval"
```

---

### Task 5: Record listing as market observation after each analysis

When a listing is analyzed, it should be stored as a `MarketObservation` so future analyses of similar products have real data to draw from. Without this, the DB never grows from actual usage.

**Files:**
- Modify: `backend/src/analysis/run.ts` — call `recordObservations` after analysis

**Interfaces:**
- Consumes: `recordObservations(obs: MarketObservation[]): Promise<number>` from `../marketplace/marketObservations.js`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/analysisRepository.test.ts` (new describe block):

```typescript
import { vi } from 'vitest';

vi.mock('../src/marketplace/marketObservations.js', () => ({
  recordObservations: vi.fn().mockResolvedValue(1),
}));

import { runProductAnalysis } from '../src/analysis/run.js';
import { recordObservations } from '../src/marketplace/marketObservations.js';

describe('runProductAnalysis', () => {
  it('records the listing as a market observation', async () => {
    const recordMock = vi.mocked(recordObservations);
    await runProductAnalysis({ title: 'iPhone 13', price: 1500, currency: 'ILS' });
    expect(recordMock).toHaveBeenCalledOnce();
    const [observations] = recordMock.mock.calls[0];
    expect(observations[0].productName).toBe('iPhone 13');
    expect(observations[0].observedPrice).toBe(1500);
    expect(observations[0].currency).toBe('ILS');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/analysisRepository.test.ts
```

Expected: FAIL — `recordObservations` is never called.

- [ ] **Step 3: Add observation recording to `run.ts`**

Add the import and the call after `setCachedAnalysis` in `runProductAnalysis`:

```typescript
import { recordObservations } from '../marketplace/marketObservations.js';
```

After `setCachedAnalysis(cacheKey, response);` add:

```typescript
  void recordObservations([
    {
      productName: listing.title,
      observedPrice: listing.price,
      currency: listing.currency,
      source: listing.source ?? 'facebook',
      timestamp: listing.observedAt,
    },
  ]);
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/shaishargal/worthIT/backend && npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/shaishargal/worthIT
git add backend/src/analysis/run.ts backend/tests/analysisRepository.test.ts
git commit -m "feat: record analyzed listing as market observation for future queries"
```

---

### Task 6: Auth route — POST /auth/google with JWT

The API design doc requires `POST /auth/google` to accept a Google OAuth token and return a JWT. For MVP, we stub the Google token verification (accept any non-empty token, extract a fake user). The JWT infrastructure is real so auth middleware can be added later.

**Files:**
- Install: `jsonwebtoken` and `@types/jsonwebtoken`
- Create: `backend/src/auth/jwt.ts`
- Modify: `backend/src/auth/auth.route.ts`
- Modify: `backend/.env.example` — add `JWT_SECRET`

**Interfaces:**
- Produces:
  - `signToken(payload: JwtPayload): string`
  - `POST /auth/google` → `200 { user, accessToken }` | `400 { error }` | `401 { error }`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/shaishargal/worthIT/backend && npm install jsonwebtoken && npm install --save-dev @types/jsonwebtoken
```

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('POST /auth/google', () => {
  it('returns 400 when googleToken is missing', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/google').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 200 with user and accessToken for any non-empty token', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const app = createApp();
    const res = await request(app)
      .post('/auth/google')
      .send({ googleToken: 'any-google-token' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).toHaveProperty('email');
    delete process.env.JWT_SECRET;
  });

  it('returns 500 when JWT_SECRET is not set', async () => {
    delete process.env.JWT_SECRET;
    const app = createApp();
    const res = await request(app)
      .post('/auth/google')
      .send({ googleToken: 'any-google-token' });
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/auth.test.ts
```

Expected: FAIL — `POST /auth/google` still returns 501.

- [ ] **Step 4: Create `backend/src/auth/jwt.ts`**

```typescript
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET env var is not set');
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET env var is not set');
  return jwt.verify(token, secret) as JwtPayload;
}
```

- [ ] **Step 5: Implement `auth.route.ts`**

Replace the stub:

```typescript
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { signToken } from './jwt.js';

export const authRouter = Router();

authRouter.post('/google', (req, res, next) => {
  try {
    const { googleToken } = req.body as { googleToken?: unknown };

    if (typeof googleToken !== 'string' || !googleToken.trim()) {
      return res.status(400).json({ error: 'googleToken is required' });
    }

    // MVP stub: accept any non-empty token, generate a synthetic user.
    // Replace this block with real Google token verification in production.
    const userId = randomUUID();
    const email = `user-${userId.slice(0, 8)}@worthit.stub`;

    const accessToken = signToken({ userId, email });

    return res.json({
      user: { id: userId, email, fullName: 'WorthIT User', profilePicture: null },
      accessToken,
    });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 6: Update `.env.example`**

Add to `backend/.env.example`:

```
JWT_SECRET=change-me-in-production
```

- [ ] **Step 7: Run all tests**

```bash
cd /Users/shaishargal/worthIT/backend && npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/shaishargal/worthIT
git add backend/src/auth/jwt.ts backend/src/auth/auth.route.ts backend/.env.example backend/tests/auth.test.ts backend/package.json backend/package-lock.json
git commit -m "feat: implement POST /auth/google with JWT signing (MVP stub — no Google verification)"
```

---

### Task 7: Usage tracking — GET /user/usage

The API design doc defines `GET /user/usage` to return how many analyses the user has used this month and how many remain. For MVP, use an in-memory counter (no authentication check — returns the global count).

**Files:**
- Create: `backend/src/usage/usageTracker.ts`
- Modify: `backend/src/usage/user.route.ts`
- Modify: `backend/src/analysis/analysis.route.ts` — increment counter on successful analysis

**Interfaces:**
- Produces:
  - `incrementUsage(): void`
  - `getUsageStats(): { analysesUsed: number; monthlyAnalysisLimit: number; remainingAnalyses: number; subscriptionPlan: string }`
  - `GET /user/usage` → `200 UsageStats`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/usage.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetUsageForTests } from '../src/usage/usageTracker.js';

beforeEach(() => {
  resetUsageForTests();
});

describe('GET /user/usage', () => {
  it('returns usage stats with 200', async () => {
    const app = createApp();
    const res = await request(app).get('/user/usage');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('analysesUsed');
    expect(res.body).toHaveProperty('monthlyAnalysisLimit');
    expect(res.body).toHaveProperty('remainingAnalyses');
    expect(res.body).toHaveProperty('subscriptionPlan');
  });

  it('analysesUsed starts at 0', async () => {
    const app = createApp();
    const res = await request(app).get('/user/usage');
    expect(res.body.analysesUsed).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/usage.test.ts
```

Expected: FAIL — `GET /user/usage` returns 501.

- [ ] **Step 3: Create `backend/src/usage/usageTracker.ts`**

```typescript
const MONTHLY_LIMIT = 15;

let analysesUsed = 0;

export function incrementUsage(): void {
  analysesUsed += 1;
}

export function getUsageStats() {
  return {
    analysesUsed,
    monthlyAnalysisLimit: MONTHLY_LIMIT,
    remainingAnalyses: Math.max(0, MONTHLY_LIMIT - analysesUsed),
    subscriptionPlan: 'Free',
  };
}

export function resetUsageForTests(): void {
  analysesUsed = 0;
}
```

- [ ] **Step 4: Implement `user.route.ts`**

Replace the stub:

```typescript
import { Router } from 'express';
import { getUsageStats } from './usageTracker.js';

export const userRouter = Router();

userRouter.get('/usage', (_req, res) => {
  res.json(getUsageStats());
});
```

- [ ] **Step 5: Increment counter in `analysis.route.ts`**

Add import and call `incrementUsage()` after a successful analysis response is prepared. In `analysis.route.ts`, add inside the `POST /analyze` handler after `const result = await runProductAnalysis(parsed.data);`:

```typescript
import { incrementUsage } from '../usage/usageTracker.js';
```

After `const result = await runProductAnalysis(parsed.data);` add:

```typescript
    incrementUsage();
```

- [ ] **Step 6: Run all tests**

```bash
cd /Users/shaishargal/worthIT/backend && npm test
```

Expected: PASS — all tests green.

- [ ] **Step 7: Run the full test suite with typecheck**

```bash
cd /Users/shaishargal/worthIT/backend && npm run typecheck && npm test
```

Expected: no TypeScript errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/shaishargal/worthIT
git add backend/src/usage/usageTracker.ts backend/src/usage/user.route.ts backend/src/analysis/analysis.route.ts backend/tests/usage.test.ts
git commit -m "feat: implement GET /user/usage with in-memory usage tracking"
```

---

## Self-Review

### Spec coverage check

| Doc requirement | Task |
|---|---|
| `POST /analysis/analyze` (main endpoint) | Task 2 |
| `GET /analysis/:id` (detailed analysis) | Tasks 3 + 4 |
| `POST /auth/google` | Task 6 |
| `GET /user/usage` | Task 7 |
| Store analyzed products in DB | Task 3 |
| Store historical analyses in DB | Task 3 |
| Record market observations | Task 5 |
| Analysis cache (already existed) | — kept |
| `analysisId` in response | Task 3 |
| App starts without crashing | Task 1 |

### Gaps noted
- **Google OAuth real verification** is stubbed (MVP decision — documented in code comment). Production needs `GOOGLE_CLIENT_ID` env var and a call to Google's tokeninfo endpoint.
- **Auth middleware** (enforcing JWT on `/analysis/analyze`) is not in this plan — the docs say auth is required but the MVP definition leaves it open. Add after validating the MVP works.
- **`analyzeProduct.route.ts`** is now orphaned (nothing imports it). It can be deleted in a follow-up cleanup commit.
- **Extension UI for "View Details"** (using `GET /analysis/:id`) is not in scope for this plan — the overlay doesn't have a "More Details" button yet.

### Type consistency check
- `AnalyzeProductResponse.analysisId: string` — added in Task 3, used in Tasks 3, 4, 6.
- `buildAnalysisId()` returns `string` (Task 3) — used in `run.ts` (Task 3).
- `findAnalysisById(id: string)` returns `Promise<AnalyzeProductResponse | null>` (Task 3) — used in `analysis.route.ts` (Task 4). ✓
- `getUsageStats()` return shape matches what the test asserts and what the route sends. ✓
- `signToken(payload: JwtPayload)` — `JwtPayload` has `userId` and `email` (Task 6). ✓
