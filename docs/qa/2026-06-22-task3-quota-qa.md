# WorthIT — QA Report
**Date:** 2026-06-22  
**Scope:** Task 3 — Quota System + Trial Keys (commit `6782168`)  
**Reviewed by:** Claude (Senior QA Engineer role)  
**Tests after fixes:** 93 passing, 0 failing (+9 new quota service unit tests)

---

## Issues Found & Fixed

### Critical

| # | File | Issue | Fix |
|---|------|--------|-----|
| C1 | `quotaService.ts` | Race condition — read-then-write on `User.analysesUsedThisMonth`. Two concurrent requests both read remaining=1, both pass, user gets 16 analyses instead of 15 | Replaced with atomic `findOneAndUpdate({ analysesUsedThisMonth: { $lt: tierLimit } }, { $inc: ... })` — concurrent requests now correctly serialize |

### Medium

| # | File | Issue | Fix |
|---|------|--------|-----|
| M1 | `quotaService.ts` | `user.trialExpiresAt = undefined` on expired trial — never saved to DB, no-op on every request | Removed the line entirely; expired trial simply falls through to quota check |
| M2 | `googleAuth.ts` + `quotaService.ts` | `TIER_LIMITS` object duplicated — free tier limit set to 15 in two places, must stay in sync manually | Extracted to `src/config/tierLimits.ts`; both files import from there |
| M3 | `googleAuth.ts` + `quotaService.ts` | `isNewMonth()` duplicated — identical function in two files | Extracted to `src/config/tierLimits.ts` alongside `TIER_LIMITS` |
| M4 | `user/user.route.ts` | Two DB reads per `/user/me` request — `UserModel.findById` then `getAnalysesRemaining` internally fetches the same user again | Removed second fetch; `analysesRemaining` now computed inline from already-loaded user using `TIER_LIMITS` |
| M5 | `usage/` module | `usageTracker.ts`, `user.route.ts`, `usage/index.ts` — all three files orphaned after Task 3 replaced them | Deleted all three |

### Minor

| # | Fix |
|---|-----|
| m1 | `usage.test.ts` mock missing `analysesUsedThisMonth` field — caused `Math.max(0, NaN)` in route response | Added field to mock |

---

## New Tests Added

`tests/quotaService.test.ts` — 9 unit tests for business logic (no MongoDB required):

| Scenario | Covered |
|----------|---------|
| User not found → `allowed: false` | ✅ |
| Trial active → allow, bypass quota, no DB increment | ✅ |
| Quota not exceeded → atomic increment, correct remaining | ✅ |
| Quota exactly at limit → `allowed: false`, 0 remaining, no usage log | ✅ |
| Month rolled over → resets counter before increment | ✅ |
| `getAnalysesRemaining` — user not found → 0 | ✅ |
| `getAnalysesRemaining` — mid-month → correct count | ✅ |
| `getAnalysesRemaining` — at limit → 0 | ✅ |
| `getAnalysesRemaining` — new month → resets, returns full limit | ✅ |

---

## Architecture Note: Monthly Reset Strategy

The current approach resets the counter on the first request of a new month (lazy reset). This means:
- A user who doesn't log in on the 1st won't be reset until they next make a request
- The `monthStartDate` on their User document will lag behind

This is acceptable for MVP. A cron job approach (background task on the 1st of each month) would be more precise but is out of scope for Phase 1.

---

## Carry-Forward Open Items

- [ ] Pass `userId` from auth middleware into `saveAnalysis()` in `run.ts` so Analysis documents are linked to users
- [ ] Add `ref: 'User'` to `Analysis.userId` for Mongoose populate support
- [ ] `Product.specs.year` typed `Number` but specsExtractor returns string
- [ ] Monthly reset is lazy (on first request) — consider cron job post-MVP

---

## Verdict

**✅ Ready for Production** (Task 3 scope)

Quota system is now correct: atomic increment prevents over-quota, trial bypass works, monthly reset fires, audit log writes, 402 response on limit. All 93 tests passing.

**→ Task 4 approved to proceed.**
