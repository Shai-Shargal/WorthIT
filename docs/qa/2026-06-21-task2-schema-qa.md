# WorthIT — QA Report
**Date:** 2026-06-21  
**Scope:** Task 2 — Database Schema Refactoring (commit `401f783`)  
**Reviewed by:** Claude (Senior QA Engineer role)  
**Tests after fixes:** 84 passing, 0 failing (+14 new schema validation tests)

---

## Issues Found & Fixed

### Critical

| # | File | Issue | Fix |
|---|------|--------|-----|
| C1 | `Analysis.ts` | `userId` + `productId` marked `required: true` — but `run.ts` calls `saveAnalysis` without them → every analysis save silently failed (Mongoose validation error swallowed in try/catch) | Made both optional; `required: true` re-enable when Task 3 wires user context into the analysis route |
| C2 | `Product.ts` | `analysisHistory` array embedded full copy of every analysis result — unbounded growth (16MB doc limit risk) + data duplication with `Analysis` collection + update anomalies | Removed entirely; use `Analysis.find({ productId })` to query history |
| C3 | `UserFeedback.ts` | `analysisId` typed as `ObjectId` but `Analysis.analysisId` is a UUID string — references could never be resolved | Added `ref: 'Analysis'` to correctly target `Analysis._id` (ObjectId); documented the distinction in a comment |

### Medium

| # | File | Issue | Fix |
|---|------|--------|-----|
| M1 | `Analysis.ts` | `dataQuality` enum missing `'seed'` — Tavily-only results would fail schema validation or be silently dropped | Added `'seed'` to enum: `['real', 'seed', 'limited', 'insufficient']` |
| M2 | `Product.ts` | `marketObservations` array duplicated data already in `market_observations` collection — same unbounded growth risk | Removed entirely |
| M3 | `Analysis.ts` | `listing.image` and `listing.url` had no length cap — risk of very large strings | Added `maxlength: 2048` to both |
| M4 | `analysisRepository.ts` | `updatedAt` never updated on upsert — always showed creation time | Added `updatedAt: new Date()` to `$set` block |
| M5 | `Analysis.ts` | Duplicate index: `productId` had `index: true` on field + `analysisSchema.index({ productId: 1 })` below — Mongoose warning, redundant write overhead | Removed `index: true` from field definition; compound index below is sufficient |

### Minor (deferred to Task 3)

| # | Issue | Deferred reason |
|---|-------|----------------|
| m1 | Three parallel usage tracking systems (in-memory, `User.analysesUsedThisMonth`, `UsageLog`) — no single source of truth | Task 3 explicitly covers quota system wiring |
| m2 | `Product.specs.year` typed `Number` but `specsExtractor` returns string | Not wired yet; low risk |

---

## New Tests Added

`tests/models.test.ts` — 14 schema validation tests (no MongoDB required):

| Model | Tests |
|-------|-------|
| `UsageLog` | Invalid `yearMonth` format rejected, valid accepted, negative `analysesUsed` rejected |
| `UserFeedback` | `accuracy` below 1 rejected, above 5 rejected, valid without accuracy accepted, notes >1000 chars rejected |
| `Product` | Invalid marketplace enum rejected, all 4 valid values accepted, `analysisHistory` confirmed absent, `marketObservations` confirmed absent |
| `Analysis` | Saves without `userId`/`productId` (optional confirmed), invalid verdict rejected, all 4 `dataQuality` values including `'seed'` accepted |

---

## Carry-Forward Open Items

- [ ] Wire user context into `POST /analysis/analyze` so `userId` can be passed to `saveAnalysis` (Task 3)
- [ ] Wire `UsageLog` writes to analysis route — `UsageLogModel.updateOne({ userId, yearMonth }, { $inc: { analysesUsed: 1 } }, { upsert: true })` (Task 3)
- [ ] Retire in-memory `usageTracker.ts` once per-user MongoDB tracking is live (Task 3)
- [ ] Add `ref: 'User'` to `Analysis.userId` for Mongoose populate support
- [ ] `Product.specs.year` should be `String` to match `specsExtractor` output

---

## Verdict

**✅ Ready for Production** (Task 2 scope)

Schema is now clean: no unbounded embedded arrays, correct reference types, proper enum coverage, `userId`/`productId` optional until caller chain supports them. All 84 tests passing.

**→ Task 3 approved to proceed.**
