# WorthIT Phase 1 MVP - Manual QA Checklist

**Date:** 2026-06-22  
**Phase:** Phase 1 MVP  
**Status:** Ready for QA Testing

---

## Pre-Flight Checks

### Environment Setup
- [ ] Backend running on `http://localhost:4000`
- [ ] Chrome extension loaded in dev mode
- [ ] MongoDB connected and seeded with test data
- [ ] Google OAuth credentials configured (.env has GOOGLE_CLIENT_ID + SECRET)
- [ ] OpenAI API key configured
- [ ] Tavily API key configured
- [ ] SENTRY_DSN configured (optional but recommended)

### Browser Setup
- [ ] Open Chrome DevTools (F12) → Console for error logs
- [ ] Check Network tab for failed requests
- [ ] Clear cache/cookies before testing

---

## 1. Authentication Flow (POST /auth/google)

### Test 1.1: First-time User Signup
- [ ] Open extension
- [ ] Click "Login with Google"
- [ ] Complete Google OAuth flow
- [ ] **Expected:** 
  - Redirect to extension with token
  - User created in MongoDB (tier: 'free', analysesRemaining: 15)
  - Trial set for 7 days from now
- [ ] **Check:** No errors in console, token persisted in extension storage

### Test 1.2: Returning User Login
- [ ] Log out and log back in with same Google account
- [ ] **Expected:**
  - Same user loaded (not duplicate)
  - analysesRemaining reflects current month's usage
  - Token updated
- [ ] **Check:** No "duplicate key" errors in backend console

### Test 1.3: Invalid Google Token
- [ ] Manually craft request with invalid token:
  ```bash
  curl -X POST http://localhost:4000/auth/google \
    -H "Content-Type: application/json" \
    -d '{"googleToken":"invalid-jwt"}'
  ```
- [ ] **Expected:** 500 error with message "Invalid Google token"
- [ ] **Check:** Error logged to Sentry (if SENTRY_DSN set)

### Test 1.4: Missing Token Field
- [ ] POST /auth/google with empty body
- [ ] **Expected:** 400 error "googleToken is required"
- [ ] **Check:** No backend exception, graceful validation

---

## 2. Analysis Endpoint (POST /analysis/analyze)

### Test 2.1: Happy Path - Full Analysis
- [ ] Go to Facebook Marketplace, open a product listing
- [ ] Click "Analyze with WorthIT"
- [ ] Wait for overlay to load
- [ ] **Expected:**
  - Overlay shows: Title, Verdict (worth_it/maybe/avoid), Rating (1-5)
  - Reasoning shows: Summary, Positives, Concerns
  - Red Flags displayed (if any)
  - analysesRemaining decremented (15 → 14 → etc)
- [ ] **Check:** 
  - Network shows POST 200
  - analysisId in response (UUID format)
  - No console errors

### Test 2.2: Price Sanity Detection
- [ ] Analyze product with suspiciously low price (e.g., ₪100 for iPhone)
- [ ] **Expected:** Red flag "Price is unusually low"
- [ ] Analyze product with suspiciously high price (e.g., ₪50,000 for phone)
- [ ] **Expected:** Red flag "Price is unusually high"

### Test 2.3: Stock Photo Detection
- [ ] Analyze product with stock photo (unsplash/pexels in image URL)
- [ ] **Expected:** Red flag "Image appears to be from stock photo service"

### Test 2.4: Urgency Language Detection
- [ ] Analyze product with description containing multiple urgency keywords ("URGENT", "ASAP", "limited time")
- [ ] **Expected:** Red flag "High-pressure language detected"

### Test 2.5: Missing Accessories Detection
- [ ] Analyze phone listing with description "no charger" or "no cable"
- [ ] **Expected:** Red flag "may be missing common accessories"

### Test 2.6: Auth Required
- [ ] Send request without Authorization header:
  ```bash
  curl -X POST http://localhost:4000/analysis/analyze \
    -H "Content-Type: application/json" \
    -d '{"title":"Test","price":100,"currency":"ILS"}'
  ```
- [ ] **Expected:** 401 "Missing or invalid Authorization header"

### Test 2.7: Invalid Input
- [ ] Missing title → 400 error
- [ ] Missing price → 400 error
- [ ] Missing currency → 400 error
- [ ] Price ≤ 0 → 400 error
- [ ] URL not valid → accepted (optional field)

---

## 3. Quota System (Rate Limiting + Monthly Limits)

### Test 3.1: Free Tier Quota (15 analyses/month)
- [ ] Create new test user
- [ ] Analyze 15 products (should all succeed, analysesRemaining: 15→1)
- [ ] Attempt 16th analysis
- [ ] **Expected:** 402 Payment Required "Quota exceeded. Limit: 15 analyses per month."
- [ ] **Check:** analysesRemaining: 0

### Test 3.2: Rate Limiting (20 req/min on /analyze)
- [ ] Send 20 requests rapidly to POST /analyze
- [ ] **Expected:** All 20 succeed (200)
- [ ] Send 21st request
- [ ] **Expected:** 429 "Too many requests" with X-RateLimit-Reset header
- [ ] Wait for reset window (60 seconds)
- [ ] **Expected:** Next request succeeds (200)

### Test 3.3: Trial Period (7 days unlimited)
- [ ] Create new user (auto-gets 7-day trial)
- [ ] Analyze 20 products (should all succeed despite free tier limit)
- [ ] **Expected:** No 402 errors during trial
- [ ] **Check:** trialExpiresAt is 7 days from creation

### Test 3.4: Trial Expiry
- [ ] After trial expires, attempt analysis beyond free tier limit
- [ ] **Expected:** 402 "Quota exceeded"
- [ ] **Check:** trialExpiresAt is cleared from user doc

### Test 3.5: Monthly Reset
- [ ] After month boundary, analysesRemaining resets
- [ ] **Expected:** User who was at 0 remaining can analyze again
- [ ] **Check:** analysesUsedThisMonth reset to 0

---

## 4. User Endpoints

### Test 4.1: GET /user/me
- [ ] Make request:
  ```bash
  curl -H "Authorization: Bearer $TOKEN" \
    http://localhost:4000/user/me
  ```
- [ ] **Expected:** 200 with:
  - id, email, tier, analysesRemaining, trialExpiresAt, createdAt
  - analysesRemaining = 15 - (analyses used this month)

### Test 4.2: GET /user/analyses
- [ ] After 3+ analyses, request:
  ```bash
  curl -H "Authorization: Bearer $TOKEN" \
    "http://localhost:4000/user/analyses?limit=10&offset=0"
  ```
- [ ] **Expected:** 200 with:
  - analyses array (sorted by createdAt DESC)
  - total count
  - hasMore boolean
  - Pagination works: limit capped at 100, offset respected

### Test 4.3: GET /user/analyses with Marketplace Filter
- [ ] Request with ?marketplace=facebook
- [ ] **Expected:** 200 (filter accepted, though results currently not filtered by marketplace)
- [ ] Request with ?marketplace=invalid
- [ ] **Expected:** 400 "marketplace must be one of: facebook, yad2, ebay, amazon"

### Test 4.4: POST /user/feedback
- [ ] After analysis, request:
  ```bash
  curl -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"analysisId":"uuid-123","helpful":true,"accuracy":4,"notes":"Good"}' \
    http://localhost:4000/user/feedback
  ```
- [ ] **Expected:** 201 with feedback id, helpful, accuracy, createdAt

### Test 4.5: Feedback Validation
- [ ] Missing analysisId → 400
- [ ] Missing helpful → 400
- [ ] accuracy not 1-5 → 400
- [ ] notes > 1000 chars → 400
- [ ] accuracy optional if not provided → 201 OK

---

## 5. Error Handling & Sentry

### Test 5.1: 500 Errors → Sentry
- [ ] Simulate backend error (e.g., disconnect MongoDB temporarily)
- [ ] Attempt analysis
- [ ] **Expected:** 500 response
- [ ] **Check:** Error appears in Sentry dashboard with:
  - Full stack trace
  - userId
  - endpoint (POST /analysis/analyze)
  - request headers

### Test 5.2: 401/402 Errors → Sentry (Info Level)
- [ ] Trigger 402 (quota exceeded)
- [ ] **Expected:** Should NOT appear as ERROR in Sentry, only INFO
- [ ] **Check:** Error context includes userId, endpoint

### Test 5.3: Invalid Input → No Sentry Log
- [ ] Send 400 validation error
- [ ] **Expected:** No Sentry entry (client error, not server error)

---

## 6. CORS Configuration

### Test 6.1: Chrome Extension Origin
- [ ] Analyze product from extension
- [ ] **Expected:** 200 OK (chrome-extension:// origin allowed)

### Test 6.2: Localhost Development
- [ ] Make fetch from http://localhost:3000
- [ ] **Expected:** 200 OK (dev origin allowed)

### Test 6.3: Blocked Origins
- [ ] Make request from random third-party origin
- [ ] **Expected:** CORS error (browser blocks response)

### Test 6.4: Credentials Support
- [ ] Extension makes requests with credentials: 'include'
- [ ] **Expected:** Cookies/headers passed through (if applicable)

---

## 7. Edge Cases & Stress Tests

### Test 7.1: Concurrent Analyses
- [ ] Trigger 3 analyses simultaneously in extension
- [ ] **Expected:** All succeed with unique analysisIds
- [ ] **Check:** Quota incremented 3 times

### Test 7.2: SPA Navigation (Facebook Marketplace)
- [ ] Analyze Product A
- [ ] While overlay loading, click Product B
- [ ] **Expected:** 
  - Overlay closes on URL change
  - Analysis still completes but doesn't overwrite new product overlay
  - Clicking Analyze on Product B shows fresh analysis
  - No stale data persists

### Test 7.3: Very Long Description
- [ ] Analyze product with 1000+ character description
- [ ] **Expected:** Fraud detection checks description without error
- [ ] Response includes all checks (urgency, accessories)

### Test 7.4: Missing Optional Fields
- [ ] Analyze without description
- [ ] Analyze without image
- [ ] Analyze without url
- [ ] **Expected:** All succeed with null/undefined fields handled gracefully

---

## 8. Database Integrity

### Test 8.1: Product Deduplication
- [ ] Analyze same product twice (same URL)
- [ ] **Expected:** 
  - Same Product doc in MongoDB
  - Two Analysis docs linked to it
  - Product.analysisHistory contains both analyses

### Test 8.2: User History Isolation
- [ ] Create User A and User B
- [ ] User A analyzes Product 1
- [ ] User B analyzes Product 1
- [ ] **Expected:**
  - Both have separate Analysis docs
  - GET /user/analyses shows only own analyses
  - GET /analysis/:id returns 403 if not owner

### Test 8.3: Analysis Immutability
- [ ] After analysis completes, verify it can't be modified via API
- [ ] Only POST /user/feedback can be sent after

---

## 9. Performance Checks

### Test 9.1: Analysis Response Time
- [ ] Measure time from POST /analyze to response
- [ ] **Expected:** < 5 seconds (OpenAI + market data lookup)

### Test 9.2: User Endpoint Response Time
- [ ] GET /user/analyses with 100+ analyses
- [ ] **Expected:** < 1 second (paginated query)

### Test 9.3: No N+1 Queries
- [ ] Monitor MongoDB query logs
- [ ] Analyze one product → should NOT execute >5 queries total

---

## 10. Browser Extension Integration

### Test 10.1: Overlay Appearance
- [ ] Overlay centered on screen ✓
- [ ] No layout shift when content loads ✓
- [ ] Close button functional ✓
- [ ] Text readable on all product backgrounds ✓

### Test 10.2: Error Overlay
- [ ] Trigger error (e.g., invalid listing)
- [ ] Overlay shows error message with retry button ✓
- [ ] Clicking retry re-analyzes ✓

### Test 10.3: Loading State
- [ ] Observe loading spinner while analyzing ✓
- [ ] Spinner terminates when analysis completes ✓
- [ ] No stuck loading state if network fails ✓

---

## 11. Known Issues & Regression Prevention

### Regression Test: URL Change Detection
- [ ] Fixed in commit 5606513 + 2739e3f
- [ ] Analyze Product A → overlay closes on navigation ✓
- [ ] Analyze Product B → fresh analysis displays ✓
- [ ] No stale data persists ✓

### Regression Test: OAuth Token Validation
- [ ] Fixed in Task 1 googleAuth.ts
- [ ] Invalid token rejected ✓
- [ ] Valid token accepted ✓
- [ ] Expired token handled ✓

### Regression Test: Quota Enforcement
- [ ] Fixed in Task 3 quotaService.ts
- [ ] Free tier at limit → 402 ✓
- [ ] Trial unlimited → no 402 ✓
- [ ] Monthly reset works ✓

---

## Sign-Off

### QA Engineer: _____________________  Date: ___________

### Tests Passed: _____ / _____

### Bugs Found (P0-P3):
1. 
2. 
3. 

### Ready to Ship? [ ] YES   [ ] NO

---

## Notes
- Document any new bugs discovered in `/docs/qa/bug-reports/`
- Update this checklist after each test cycle
- All tests must pass before Phase 1 ship approval
