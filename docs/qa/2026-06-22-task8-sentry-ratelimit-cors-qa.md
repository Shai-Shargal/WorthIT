# WorthIT — QA Report
**Date:** 2026-06-22  
**Scope:** Task 8 — Sentry, Rate Limiting, CORS Hardening (commit `556c75c`)  
**Reviewed by:** Claude (Senior QA Engineer role)  
**Tests after fixes:** 143 passing, 0 failing (+5 rate limiter tests)

---

## Issues Found & Fixed

### Critical

| # | File | Issue | Fix |
|---|------|--------|-----|
| C1 | `app.ts` | Dev CORS default included `'chrome-extension://'` (no extension ID) — not a valid origin; all extension requests blocked in dev. Regression from previous open-CORS behavior | Dev now uses `origin: true` (allow all) when `CORS_ORIGIN` not set and `NODE_ENV != production`; prod still requires explicit `CORS_ORIGIN` |

### Medium

| # | File | Issue | Fix |
|---|------|--------|-----|
| M1 | `app.ts` / `main.ts` | `initSentry()` called inside `createApp()` — re-initializes Sentry SDK on every test that calls `createApp()` (15 test files) | Moved to `main.ts` — called once at process startup |
| M2 | `rateLimiter.ts` | `req.path.includes('/analyze')` too broad — would match `/reanalyze`, `/batch-analyze` etc. | Changed to exact `req.path === '/analyze'` |
| M3 | `rateLimiter.ts` | Module-level `store` shared across tests — no reset mechanism; test isolation not guaranteed | Exported `resetStoreForTests()` |

### Minor

| # | File | Fix |
|---|------|-----|
| m1 | `sentry.ts` | `(req as any).userId` → imported and used `AuthenticatedRequest` type |

---

## New Tests Added

**`tests/rateLimiter.test.ts`** — 5 tests:

| Scenario | Result |
|----------|--------|
| Non-analyze route passes through | ✅ |
| First request under limit → 200 + correct headers | ✅ |
| 21st request → 429 + `retryAfter` + `X-RateLimit-Remaining: 0` | ✅ |
| Window expires → count resets, 200 again | ✅ |
| `/reanalyze` not rate-limited (exact match verified) | ✅ |

---

## Verdict

**✅ Ready for Production** (Task 8 scope)

Extension works in dev again. Sentry initializes once. Rate limiter correctly scoped. 143 tests passing.

**→ Task 9 approved to proceed.**
