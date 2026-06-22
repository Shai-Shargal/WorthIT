# WorthIT — QA Report
**Date:** 2026-06-22  
**Scope:** Task 6 — User Endpoints (commit `68cff87`)  
**Reviewed by:** Claude (Senior QA Engineer role)  
**Tests after fixes:** 138 passing, 0 failing (+12 new tests)

---

## Issues Found & Fixed

### Critical

| # | File | Issue | Fix |
|---|------|--------|-----|
| C1 | `user.route.ts:41` | `query['listing.marketplace']` — field doesn't exist in Analysis schema; filter silently returned 0 results | Removed the filter from the query; param is validated and accepted but documented as deferred (marketplace lives on Product, not Analysis) |

### Medium

| # | File | Issue | Fix |
|---|------|--------|-----|
| M1 | `user.route.ts` `POST /feedback` | `analysisId` never validated — missing/null `analysisId` caused `findOne({ analysisId: undefined })`, and object values opened NoSQL injection | Added type + presence check: `if (!analysisId \|\| typeof analysisId !== 'string')` → 400 |
| M2 | `user.route.ts` `POST /feedback` | `notes` > 1000 chars passed route validation, hit Mongoose schema limit, returned 500 instead of 400 | Added route-level length check → 400 |
| M3 | `analysis.route.ts` `GET /:id` | Double DB read — `findAnalysisById` queried `AnalysisModel.findOne` then another `findOne` ran for ownership check | Consolidated into single `AnalysisModel.findOne`; removed `findAnalysisById` from the GET route entirely |
| M4 | `analysis.route.ts` `GET /:id` | `doc.userId?.toString() !== req.userId` — analyses saved before auth was wired (`userId=null`) returned 403 for all users | Changed to `if (doc.userId && doc.userId.toString() !== req.userId)` — null userId is treated as legacy/public |
| M5 | `user.route.ts` `GET /analyses` | `marketplace` query param not validated — any string (including MongoDB operator objects) accepted | Added `VALID_MARKETPLACES` set check → 400 for invalid values |

### Minor

| # | Fix |
|---|-----|
| m1 | No tests for `GET /user/analyses` or `POST /user/feedback` | Added 11 tests in `tests/userRoutes.test.ts` |
| m2 | 503 test for `GET /analysis/:id` removed in Task 6 commit | Restored in `app.test.ts` with auth header |
| m3 | `offset` had no lower bound — negative offset possible | Added `Math.max(..., 0)` |

---

## New Tests Added

**`tests/userRoutes.test.ts`** — 11 tests:

| Endpoint | Scenarios |
|----------|-----------|
| `GET /user/analyses` | 401 no auth, paginated response, invalid marketplace rejected, valid marketplace accepted |
| `POST /user/feedback` | 401 no auth, missing analysisId, non-boolean helpful, accuracy out of range, notes > 1000 chars, analysis not found, 201 on valid |

**`tests/app.test.ts`** — restored 503 test for `GET /analysis/:id` (now with auth header)

---

## Architecture Note: Marketplace Filter

`GET /user/analyses?marketplace=facebook` is accepted and validated but the filter is a no-op — `marketplace` lives on `Product`, not `Analysis.listing`. A proper implementation requires either:
- Adding `marketplace` to `Analysis.listing` at save time (simple, denormalized)
- A `$lookup` join from Analysis → Product (normalized, more complex)

Deferred to a future task. The endpoint currently ignores the param after validation.

---

## Carry-Forward Open Items

- [ ] Implement marketplace filter in `GET /user/analyses` (join with Product or denormalize)
- [ ] Add `ref: 'User'` to `Analysis.userId` for Mongoose populate
- [ ] Hebrew urgency phrases missing from fraudDetection
- [ ] `Product.specs.year` typed Number but specsExtractor returns string

---

## Verdict

**✅ Ready for Production** (Task 6 scope)

All three endpoints are now correctly validated and secured. NoSQL injection vector closed. Legacy analyses accessible. 138 tests passing.

**→ Task 7 approved to proceed.**
