# Phase 1 MVP Implementation Tasks

**Workflow:** Dev → QA Review → Approval → Next Task

---

## Task 1: User Model + Google OAuth Implementation

**Objective:** Add real Google OAuth authentication with User collection

**Scope:**
- Create User Mongoose schema (email, googleId, tier, trial expiry, usage tracking)
- Implement POST /auth/google endpoint (validate Google JWT, create/find user, issue internal JWT)
- Add User collection to MongoDB with proper indexes
- JWT validation middleware (verify internal tokens, extract userId)
- POST /auth/logout endpoint with token blacklist (Redis optional for MVP)

**Files to Create:**
- `backend/src/models/User.ts` — Mongoose User schema
- `backend/src/services/googleAuth.ts` — Google OAuth logic
- `backend/src/middleware/authMiddleware.ts` — JWT validation

**Files to Modify:**
- `backend/src/app.ts` — Register auth middleware, new routes
- `backend/.env.example` — Add GOOGLE_CLIENT_ID, JWT_SECRET, NODE_ENV

**Acceptance Criteria:**
- ✅ User schema created with all fields + indexes
- ✅ Google OAuth validates real Google JWT tokens
- ✅ POST /auth/google creates user on first login, returns internal JWT
- ✅ POST /auth/logout blacklists token (or logs message if Redis skipped)
- ✅ authMiddleware extracts userId from JWT, returns 401 on invalid
- ✅ Manual test: Login with Google, receive JWT, use it to call protected endpoint
- ✅ Manual test: Invalid token rejected with 401

**Test Coverage:**
- Unit: User schema validation, JWT creation/verification
- Integration: Full Google OAuth flow (mock Google response)
- E2E: Login → Get JWT → Call /user/me → See user profile

**Estimated Time:** 1-2 days

**Ready to Start:** Yes

---

## Task 2: Database Schema Refactoring + Migrations

**Objective:** Add 4 new collections (Product, Analysis refactor, UsageLog, UserFeedback)

**Scope:**
- Create Product Mongoose schema (canonicalUrl, marketplace, specs, analysisHistory, marketObservations)
- Create UsageLog schema (userId, yearMonth, analysesUsed)
- Create UserFeedback schema (userId, analysisId, helpful, accuracy, notes)
- Refactor Analysis schema to link userId + productId
- Create Mongoose indexes on all collections
- Add DB connection validation (check all indexes exist)

**Files to Create:**
- `backend/src/models/Product.ts`
- `backend/src/models/Analysis.ts` (refactored)
- `backend/src/models/UsageLog.ts`
- `backend/src/models/UserFeedback.ts`
- `backend/src/database/migrations.ts` — Migration helpers

**Files to Modify:**
- `backend/src/database/mongoose.ts` — Update connection logic, validate indexes

**Acceptance Criteria:**
- ✅ All 5 schemas defined with TypeScript interfaces
- ✅ Proper Mongoose indexes created (compound, unique, TTL where needed)
- ✅ Manual test: Connect to MongoDB, verify all collections exist with correct indexes
- ✅ No Schema.Types.Mixed anywhere
- ✅ Validation rules enforce data integrity (email format, tier enum, price > 0, etc.)

**Test Coverage:**
- Unit: Schema validation (valid + invalid data)
- Integration: Schema creation, index verification

**Estimated Time:** 1 day

**Ready to Start:** After Task 1

---

## Task 3: Quota System + Trial Keys

**Objective:** Track user analyses, enforce free tier limit (15/month), implement trial keys

**Scope:**
- Implement UsageLog tracking (increment on each analysis)
- Implement quota check in POST /analyze (return 402 if exceeded)
- Trial expiry logic (free tier → 1-week trial → regular free tier after)
- GET /user/me returns analysesRemaining = tier_limit - analyses_used
- Monthly reset logic (reset analysesUsedThisMonth on new month)

**Files to Create:**
- `backend/src/services/quotaService.ts` — Check quota, increment usage, reset monthly

**Files to Modify:**
- `backend/src/analysis/analysis.route.ts` — Add quota check to POST /analyze
- `backend/src/services/userService.ts` — Add trial expiry check

**Acceptance Criteria:**
- ✅ UsageLog created on first analysis for user+month
- ✅ Each analysis increments analysesUsedThisMonth
- ✅ Free tier limit enforced: 15th+ analysis returns 402 Payment Required
- ✅ GET /user/me shows analysesRemaining = 15 - used
- ✅ Trial users get 1-week unlimited, then fall back to free tier
- ✅ Monthly reset: analyses reset on 1st of month
- ✅ Manual test: Create user, analyze 15 times, 16th fails with 402

**Test Coverage:**
- Unit: Quota calculation, monthly reset logic
- Integration: Analyze → UsageLog increment → Quota check

**Estimated Time:** 1 day

**Ready to Start:** After Task 2

---

## Task 4: Refactor POST /analyze (Auth + Quota + Product Dedup)

**Objective:** Update analyze endpoint to use new auth, quota, and product schema

**Scope:**
- Require authentication (authMiddleware)
- Check quota before analysis (Task 3)
- Find or create Product by canonicalUrl
- Link analysis to userId + productId
- Return verdict with userId tracking
- Update Product.analysisHistory with analysis

**Files to Modify:**
- `backend/src/analysis/analysis.route.ts` — Add auth, quota check, product dedup

**Acceptance Criteria:**
- ✅ POST /analyze requires Bearer token (401 if missing)
- ✅ Quota checked before analysis (402 if exceeded)
- ✅ Product found or created by canonicalUrl
- ✅ Analysis linked to userId + productId
- ✅ Product.analysisHistory updated
- ✅ Manual test: Analyze → See verdict with userId attached

**Test Coverage:**
- Unit: Product dedup logic
- Integration: Full analyze flow with auth + quota + product creation

**Estimated Time:** 1 day

**Ready to Start:** After Task 3

---

## Task 5: Fraud Detection (Price Sanity + Stock Photo)

**Objective:** Add price bounds checking and stock photo detection

**Scope:**
- Create fraudDetection service (categoryBounds, stockPhotoIndicators)
- detectPriceSanity() — Check price is within category bounds, return RedFlag if not
- detectStockPhoto() — Check image URL for stock photo indicators, return RedFlag if found
- Integrate into POST /analyze — Add red flags to verdict

**Files to Create:**
- `backend/src/services/fraudDetection.ts`

**Files to Modify:**
- `backend/src/analysis/analysis.route.ts` — Call fraud detection, add redFlags to response

**Acceptance Criteria:**
- ✅ Price sanity: ₪5k car price for phone → RedFlag with severity 'warning'
- ✅ Stock photo: unsplash/pexels/getty URL → RedFlag with severity 'high_risk'
- ✅ Multiple redFlags possible (price + photo both flagged)
- ✅ RedFlags appear in verdict response
- ✅ Manual test: Analyze overpriced item → See price redFlag

**Test Coverage:**
- Unit: detectPriceSanity (various categories + bounds)
- Unit: detectStockPhoto (various stock photo URLs)
- Integration: Analyze → Fraud detection called → RedFlags in response

**Estimated Time:** 1 day

**Ready to Start:** After Task 4

---

## Task 6: Additional Endpoints (User Profile + Analysis History + Feedback)

**Objective:** Implement remaining 4 endpoints for user data access

**Scope:**
- GET /user/me — Return user profile + usage stats (from Task 3)
- GET /user/analyses — List user's past analyses with pagination
- GET /analysis/:id — Retrieve single analysis (user-scoped, 403 if not owner)
- POST /user/feedback — Save accuracy feedback on analysis

**Files to Modify:**
- `backend/src/routes/userRouter.ts` — Add GET /user/me, GET /user/analyses, POST /user/feedback
- `backend/src/routes/analysisRouter.ts` — Add GET /analysis/:id

**Acceptance Criteria:**
- ✅ GET /user/me returns email, picture, tier, analysesRemaining, trialExpiresAt
- ✅ GET /user/analyses returns paginated list (limit, offset, total, hasMore)
- ✅ GET /user/analyses supports ?marketplace=facebook filter
- ✅ GET /analysis/:id returns full analysis or 404
- ✅ GET /analysis/:id returns 403 if userId doesn't match
- ✅ POST /user/feedback creates UserFeedback document or returns 404 if analysis not found
- ✅ Manual test: Analyze → Get via /user/analyses → Get via /analysis/:id → Post feedback

**Test Coverage:**
- Integration: Each endpoint with valid + invalid inputs
- E2E: Analyze → List → Retrieve → Feedback

**Estimated Time:** 1 day

**Ready to Start:** After Task 4

---

## Task 7: Improve Facebook DOM Extractor + Error Logging

**Objective:** Make Facebook listing extraction more robust with fallback selectors

**Scope:**
- Add fallback selectors for title, price, description, image
- Add DOM extraction error logging to Sentry
- Test with real Facebook Marketplace URLs
- Handle missing fields gracefully

**Files to Modify:**
- `extension/src/content/extractor.ts` — Add fallback selectors, error logging

**Acceptance Criteria:**
- ✅ Title extraction tries 4+ selectors before failing
- ✅ Price extraction tries 4+ selectors before failing
- ✅ Failed extractions logged to Sentry with listing URL + selectors tried
- ✅ Manual test: Extract from 5 real FB listings successfully
- ✅ Manual test: Cause extraction failure, see error in Sentry

**Test Coverage:**
- Unit: Fallback selector logic
- Integration: Real FB URLs (if possible)

**Estimated Time:** 1 day

**Ready to Start:** After Task 5 (fraud detection)

---

## Task 8: Sentry Integration + Rate Limiting + CORS Hardening

**Objective:** Add monitoring and security controls

**Scope:**
- Configure Sentry (init, error handler, context logging)
- Add rate limiting middleware (20 req/min on /analyze)
- Harden CORS (whitelist origins, not open-to-all)
- Log key events: auth failures, quota exceeded, analysis failures, extraction errors

**Files to Create:**
- `backend/src/config/sentry.ts`
- `backend/src/middleware/rateLimiter.ts`

**Files to Modify:**
- `backend/src/app.ts` — Register Sentry + rate limiter
- All error handlers — Capture to Sentry with context

**Acceptance Criteria:**
- ✅ Sentry initialized with DSN from env
- ✅ 401, 402, 5xx errors captured to Sentry
- ✅ Rate limiter returns 429 after 20 req/min per IP
- ✅ CORS_ORIGIN env var loaded, only listed origins allowed
- ✅ Error context includes userId, endpoint, marketplace, etc.
- ✅ Manual test: Spam /analyze → Get 429 after 20 requests
- ✅ Manual test: Cause error → See in Sentry with full context

**Test Coverage:**
- Unit: Rate limiter logic
- Integration: Error capture to Sentry

**Estimated Time:** 1 day

**Ready to Start:** After Task 6 (endpoints)

---

## Task 9: Integration Test Suite

**Objective:** Build comprehensive E2E + integration tests (96+)

**Scope:**
- E2E: Full flow (Login → Analyze → Get history → Send feedback)
- E2E: Quota enforcement (15 analyses, 16th fails with 402)
- Integration: Each endpoint (auth, analyze, user, feedback)
- Integration: Fraud detection (price sanity, stock photo)
- Integration: Product deduplication

**Files to Create:**
- `backend/src/__tests__/integration/auth.integration.test.ts`
- `backend/src/__tests__/integration/analyze.integration.test.ts`
- `backend/src/__tests__/integration/user.integration.test.ts`
- `backend/src/__tests__/integration/fraud.integration.test.ts`
- `backend/src/__tests__/e2e/full-flow.e2e.test.ts`
- `backend/src/__tests__/e2e/quota-enforcement.e2e.test.ts`

**Acceptance Criteria:**
- ✅ 96+ tests passing (33 existing DB + 63 specs + new integration tests)
- ✅ Test coverage > 80% for new code
- ✅ All critical paths tested (happy path + error cases)
- ✅ E2E tests use real MongoDB (testcontainers or local test DB)
- ✅ Tests clean up after themselves (no leftover data)

**Test Coverage:**
- 30+ integration tests (auth, endpoints, fraud detection)
- 8+ E2E tests (full flows, quota, error scenarios)

**Estimated Time:** 2 days

**Ready to Start:** After Task 8 (monitoring)

---

## Task 10: Manual QA + Bug Fixes

**Objective:** Full manual testing checklist + bug fixes

**Scope:**
- Test all 7 endpoints manually
- Test all fraud detection scenarios
- Test quota enforcement
- Test rate limiting
- Test error logging in Sentry
- Fix any bugs found

**Acceptance Criteria:**
- ✅ All manual QA checklist items passed (from PM spec)
- ✅ Zero P1 bugs remaining
- ✅ Sentry shows real errors (no noise)
- ✅ Rate limiting working on production config
- ✅ CORS not too open, not too restrictive

**Estimated Time:** 1 day

**Ready to Start:** After Task 9 (tests)

---

## Task 11: TBD Decisions + Phase 2 Prep

**Objective:** Clarify Yad2 + Facebook seller ratings, document for Phase 2

**Scope:**
- Founder decision on Yad2: API vs DOM extraction
- Founder decision on Facebook seller ratings: Graph API vs DOM extraction
- Create stubs for Task 12 (Yad2) and Task 13 (seller ratings)
- Document assumptions for Phase 2

**Files to Create:**
- `backend/src/marketplace/providers/yad2.ts` (stub)
- `backend/src/services/sellerInfo.ts` (stub)

**Acceptance Criteria:**
- ✅ Founder decision documented
- ✅ Stubs created with clear TODO comments
- ✅ Phase 2 tasks can start immediately after decision

**Estimated Time:** 1 day (blocked on founder)

**Ready to Start:** After Task 10 (manual QA)

---

## Summary

| Task | Objective | Depends On | Est. Time |
|------|-----------|-----------|-----------|
| 1 | User model + Google OAuth | — | 1-2d |
| 2 | Database schema refactor | Task 1 | 1d |
| 3 | Quota system + trial keys | Task 2 | 1d |
| 4 | Refactor POST /analyze | Task 3 | 1d |
| 5 | Fraud detection | Task 4 | 1d |
| 6 | User endpoints | Task 4 | 1d |
| 7 | Facebook extractor improvements | Task 5 | 1d |
| 8 | Sentry + rate limiting + CORS | Task 6 | 1d |
| 9 | Integration tests | Task 8 | 2d |
| 10 | Manual QA + bug fixes | Task 9 | 1d |
| 11 | TBD decisions + Phase 2 prep | Task 10 | 1d |

**Total: ~13 days** (10 tasks × 1d + 1 task × 2d)

**Phase 1 Ready for Reseller Recruitment after Task 10 ✅**

---

## Workflow

```
1. I complete Task 1 → Tell you "Task 1 complete"
2. You tell QA to review Task 1
3. QA reviews, approves or flags issues
4. If approved → Move to Task 2
5. If issues → I fix, QA re-reviews
6. Repeat until all tasks done
```

Ready to start Task 1?
