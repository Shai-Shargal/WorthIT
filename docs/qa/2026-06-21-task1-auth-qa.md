# WorthIT — QA Report
**Date:** 2026-06-21  
**Scope:** Task 1 — User Model + Google OAuth (commit `1358e90`)  
**Reviewed by:** Claude (Senior QA Engineer role)  
**Tests after fixes:** 70 passing, 0 failing (+9 new auth tests)

---

## Issues Found & Fixed

### Critical

| # | File | Issue | Fix |
|---|------|--------|-----|
| C1 | `services/googleAuth.ts:28-35` | Test backdoor hardcoded in production service — `if NODE_ENV=test && googleToken === 'any-google-token'` grants auth to any staging/CI server with `NODE_ENV=test` | Removed entirely; replaced with `vi.mock` in test file |
| C2 | `src/auth/jwt.ts`, `src/auth/middleware.ts` | Orphaned dead code from previous QA session — unreferenced by anything, source of confusion about which middleware is live | Both files deleted |

### Medium

| # | File | Issue | Fix |
|---|------|--------|-----|
| M1 | `googleAuth.ts:5` | `googleClient` initialized at module import time — `GOOGLE_CLIENT_ID` may be undefined when module first loads | Moved into `getGoogleClient()` lazy factory function |
| M2 | `googleAuth.ts:117` | `analysesRemaining` produces `NaN` when `user.tier` not in `tierLimits` — `Math.max(0, NaN) === NaN` sent to client | Added `?? 0` fallback: `const limit = TIER_LIMITS[user.tier] ?? 0` |
| M3 | `googleAuth.ts` | No monthly reset logic — `analysesUsedThisMonth` only ever incremented, never reset; counter was permanently locking users out after 15 analyses | Added `isNewMonth()` check in `authenticateWithGoogle`; resets counter and `monthStartDate` on first login of a new month |
| M4 | `googleAuth.ts` | `tierLimits` object recreated on every login call | Promoted to module-level constant `TIER_LIMITS` |

### Minor

| # | File | Issue | Fix |
|---|------|--------|-----|
| m1 | `auth/auth.route.ts` | `POST /auth/logout` returned `{ success: true }` — misleading since token is not invalidated server-side | Response now includes `note: 'Discard token client-side — server-side invalidation not yet implemented'` |
| m2 | `tests/auth.test.ts` | Only 1 test (400 for missing token); no coverage of success path, invalid token, or `requireAuth` middleware | Added 9 tests using `vi.mock` for `authenticateWithGoogle` and `verifyJWT` |
| m3 | `tests/app.test.ts` | Still imported deleted `src/auth/jwt.ts` and set unused `authHeader` | Removed dead import and unused setup |

---

## Test Coverage Added

`tests/auth.test.ts` — 10 tests total (was 1):

| Scenario | Status |
|----------|--------|
| Missing `googleToken` → 400 | ✅ |
| Empty `googleToken` → 400 | ✅ |
| Valid token → 200 + user + token | ✅ |
| Google verification failure → 500 | ✅ |
| Logout without token → 401 | ✅ |
| Logout with invalid token → 401 | ✅ |
| Logout with valid token → 200 + note | ✅ |
| `requireAuth` missing header → 401 | ✅ |
| `requireAuth` non-Bearer header → 401 | ✅ |
| `requireAuth` expired token → 401 | ✅ |

---

## Security Posture

| Check | Before | After |
|-------|--------|-------|
| `GOOGLE_CLIENT_ID` used correctly | ✅ | ✅ |
| `JWT_SECRET` min 32 chars enforced | ✅ | ✅ |
| Test bypass in production code | ❌ | ✅ Fixed |
| Dead auth files | ❌ | ✅ Deleted |
| Token blacklisting on logout | MVP deferral | MVP deferral (documented in response) |

---

## Carry-Forward Open Items

- [ ] Auth not yet applied to `POST /analysis/analyze` (MVP decision — extension has no login flow; `middleware/authMiddleware.ts` is ready to wire in)
- [ ] Usage counter (`usageTracker.ts`) is still global in-memory — not connected to the new per-user `analysesUsedThisMonth` in MongoDB
- [ ] `POST /auth/logout` has no server-side token invalidation (Redis blacklist deferred post-MVP)
- [ ] No rate limiting on `POST /analysis/analyze`
- [ ] `productToListing` hardcodes `source: 'facebook'`

---

## Verdict

**✅ Ready for Production** (Task 1 scope)

Core implementation is correct: real Google JWT validation, proper User schema with trial, 7-day JWT expiry, min-length secret enforcement, monthly usage reset. All blockers resolved.

**→ Task 2 approved to proceed.**
