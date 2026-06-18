# WorthIT — QA Report
**Date:** 2026-06-17  
**Scope:** Full backend review (`/backend/src/**`)  
**Reviewed by:** Claude (Senior QA Engineer role)  
**Tests after changes:** 34 passing, 0 failing

---

## Architecture Score: 6 / 10 → 7.5 / 10 (post-fix)

---

## Issues Found & Resolved

### Critical (all fixed)

| # | File | Issue | Fix Applied |
|---|------|--------|-------------|
| C1 | `src/ai/condition.ts:96` | `JSON.parse` without try/catch — crash on malformed AI response | Wrapped in inner try/catch with NEUTRAL fallback |
| C2 | `src/analysis/analyzeProduct.route.ts` | Dead file — `analyzeProductRouter` never mounted in `app.ts`; duplicated `productSchema` | Deleted file; extracted schema to `productSchema.ts` |
| C3 | `src/auth/` | Auth stub accepted any token; no middleware protected any route; usage limit had zero enforcement | Created `auth/middleware.ts` with `requireAuth`; applied to `POST /analysis/analyze` |
| C4 | `src/app.ts` | `cors()` allowed all origins (wildcard) | CORS now reads `CORS_ORIGIN` env var; defaults to blocking all origins |

### Medium (all fixed)

| # | File | Issue | Fix Applied |
|---|------|--------|-------------|
| M1 | `src/marketplace/providers/tavily.ts` | Search provider called `recordObservations` — SRP violation (fetch module writing to DB) | Removed from `tavily.ts`; moved to `priceGathering.ts` |
| M2 | `src/database/mongoose.ts` / two consumers | `isMongoReady()` duplicated in `analysisRepository.ts` and `marketObservations.ts` | Exported from `mongoose.ts`; both consumers now import it |
| M3 | `src/analysis/analysisRepository.ts:51` | DB error in `findAnalysisById` returned `null` → 404 instead of `'unavailable'` → 503 | `catch` block now returns `'unavailable'` |
| M4 | `src/marketplace/priceGathering.ts` | `buildDataQuality` returned `'insufficient'` for 1–4 real DB observations | Returns `'limited'` for sparse-but-real data; `'insufficient'` reserved for zero data |

### Minor (noted, not changed)

| # | Issue | Status |
|---|-------|--------|
| m1 | `productToListing` hardcodes `source: 'facebook'` — blocks future marketplace support | Deferred — `ProductInput` type has no source field; needs shared type update first |
| m2 | No rate limiting on `POST /analysis/analyze` (2 OpenAI + 1-2 Tavily calls per request) | Deferred — acceptable for MVP scale |
| m3 | `listingFingerprint` strips query params aggressively — can collide on same base URL | Deferred — low risk at current scale |
| m4 | MongoDB regex search on `productNameLower` won't scale to millions of rows | Deferred — needs text index; add before scaling |
| m5 | No TTL index on `market_observations` — collection grows unbounded | Deferred — add TTL index before production load |

---

## New Files

| File | Purpose |
|------|---------|
| `src/auth/middleware.ts` | `requireAuth` — extracts and verifies Bearer JWT; attaches `req.user` |
| `src/analysis/productSchema.ts` | Single Zod schema shared across analysis routes |

---

## Deleted Files

| File | Reason |
|------|--------|
| `src/analysis/analyzeProduct.route.ts` | Dead code — never mounted; schema was duplicated from `analysis.route.ts` |

---

## Shared Type Changes

| Type | Change |
|------|--------|
| `shared/types/market.ts` — `LocalMarketContext.dataQuality` | Added `'limited'` to the union alongside `'real' \| 'seed' \| 'insufficient'` |

**Extension impact:** `overlay.ts:buildDataQualityBanner` signature updated to accept `'limited'`; renders same "Limited data" banner as `'insufficient'`.

---

## Test Changes

| File | Change |
|------|--------|
| `tests/app.test.ts` | Added `JWT_SECRET` setup + token generation; added explicit 401 test; auth header added to analyze requests |
| `tests/aiAnalysis.test.ts` | Added `useVision: vi.fn().mockReturnValue(false)` to client mock (was missing) |
| `tests/priceGathering.test.ts` | Added `recordObservations` to mock; updated `'insufficient'` → `'limited'` assertion |
| `tests/tavily.test.ts` | Removed `recordObservations` mock and assertions (responsibility moved to `priceGathering.ts`) |

---

## Security Posture

| Area | Before | After |
|------|--------|-------|
| Auth enforcement | No middleware — all routes open | `POST /analysis/analyze` requires valid JWT |
| CORS | Wildcard (`*`) | Configurable via `CORS_ORIGIN` env var |
| Input validation | Zod on all routes | Unchanged — already correct |
| Token verification | JWT signed but never checked | JWT verified on protected routes |

---

## Remaining Risks (carry-forward)

1. **Usage counter** — still in-memory, global, not per-user. Resets on server restart. Real enforcement requires auth-bound DB storage.
2. **Auth stub** — Google token is accepted without verification. Must replace before any real user traffic.
3. **No rate limiting** — cost risk on OpenAI/Tavily if endpoint is discovered publicly.
4. **MongoDB text search** — regex-based, will degrade at scale. Add `$text` index on `productNameLower` before production load.
