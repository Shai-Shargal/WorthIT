# Phase 2 Implementation Plan

**Date:** 2026-06-23  
**Design:** APPROVED (PHASE_2_DESIGN_SPEC.md)  
**Team:** Backend Agent | Product Agent | QA Agent | Assistant (You)  
**Duration:** 6–8 weeks (Stage 1: 4–5w, Stage 2: 2–3w)

---

## 1. Work Breakdown Structure

### 1.1 Stage 1: Yad2 Scraper + Features on Facebook (4–5 weeks)

**Parallel Work Streams:**

```
BACKEND (Solo)                    PRODUCT + QA (Together)
├─ Yad2 Scraper                   ├─ Feature Specs (All 4)
│  ├─ Extractor class             │  ├─ Seller Intelligence
│  ├─ DOM selectors               │  ├─ Price Intelligence
│  ├─ Unit tests (8)              │  ├─ Listing Intelligence
│  └─ Integration tests (4)        │  └─ Market Intelligence
│                                 │
├─ Marketplace Abstraction         ├─ Acceptance Criteria
│  ├─ IMarketplaceExtractor        │  └─ Definition of done
│  ├─ Factory pattern              │
│  ├─ Refactor Facebook            ├─ Test Plans
│  └─ Unit tests (4)               │  ├─ Unit tests (46 total)
│                                 │  ├─ Integration tests (15)
├─ Feature Engine                  │  └─ E2E test cases (20)
│  ├─ SellerIntelligence impl      │
│  ├─ PriceIntelligence impl       └─ Manual QA Checklist
│  ├─ ListingIntelligence impl        └─ Verification steps
│  ├─ MarketIntelligence impl
│  └─ Unit tests (24)              ASSISTANT (Oversight)
│                                 ├─ Unblock blockers
├─ Verdict Engine                  ├─ Review architecture
│  ├─ Weight all features           ├─ Approve PRs
│  ├─ Confidence scoring           └─ Track Stage 1 progress
│  └─ Unit tests (6)
│
├─ Extension Updates
│  ├─ Yad2 detection
│  ├─ Route to YAD2_SCRAPER
│  └─ Display 4 features in overlay
│
└─ CI/CD & Deployment
   ├─ GitHub Actions setup
   ├─ Automated test gate
   └─ Auto-deploy to staging

CRITICAL PATH:
  Marketplace Abstraction → Feature Engine → Verdict Engine → Extension → Deploy
  (Backend is on critical path; QA is parallel)
```

### 1.2 Stage 2: Port Features to Yad2 (2–3 weeks)

```
BACKEND (Solo)                    PRODUCT + QA
├─ Marketplace Refactoring        ├─ Feature validation on Yad2
│  ├─ Extract common logic        │  └─ Accuracy testing
│  ├─ Simplify FeatureEngine      │
│  └─ Tests (8)                   └─ User-facing copy updates
│
├─ Feature Porting
│  ├─ Test on Yad2 data
│  ├─ Adjust for Yad2 quirks
│  └─ Tests (8)
│
└─ Performance Optimization
   ├─ Latency tuning
   ├─ Caching strategy
   └─ Tests (4)
```

---

## 2. Detailed Task Breakdown

### STAGE 1: Backend Tasks (12 tasks, ~20–25 days)

#### Backend Task 1: Yad2 Scraper - DOM Selectors & Extraction
**Owner:** Backend Agent  
**Duration:** 2 days  
**Depends On:** None  
**Blocks:** Yad2 testing, Integration tests

**Description:**
Build `YAD2_SCRAPER` class implementing `IMarketplaceExtractor`:
- Fetch Yad2 listing page (handle JS-rendered content)
- Parse DOM selectors: title, price, description, seller, images, date
- Return `RawListing` object
- Handle edge cases: missing fields, malformed HTML, timeouts

**Files to Create:**
```
backend/src/marketplace/providers/yad2.ts
├─ class Yad2Extractor implements IMarketplaceExtractor
├─ extractListing(url): Promise<RawListing>
├─ validateUrl(url): boolean
├─ fetchPage(url): Promise<string>
└─ parseDate(dateStr): Date | undefined
```

**Definition of Done:**
- ✅ Class implements IMarketplaceExtractor interface
- ✅ Extracts 95%+ of fields from real Yad2 listings
- ✅ Handles missing/malformed data gracefully
- ✅ No crashes on edge cases (timeout, malformed HTML, expired images)
- ✅ Returns properly typed `RawListing`

---

#### Backend Task 2: Yad2 Scraper - Unit Tests (8 cases)
**Owner:** Backend Agent  
**Duration:** 1 day  
**Depends On:** Task 1  
**Blocks:** None

**Test Cases:**
1. Valid Yad2 listing URL → extract all fields ✓
2. Missing seller info → graceful fallback ✓
3. Malformed price → skip extraction ✓
4. No images → return empty array ✓
5. Timeout on fetch → retry logic ✓
6. JavaScript-rendered content → wait for DOM ✓
7. Old listing (missing date) → handle undefined ✓
8. Stock photos detected → hasStockPhotos flag ✓

**Definition of Done:**
- ✅ All 8 unit tests passing
- ✅ 90%+ code coverage for Yad2Extractor
- ✅ Tests isolated (mock HTTP calls)

---

#### Backend Task 3: Marketplace Abstraction - Interface & Factory
**Owner:** Backend Agent  
**Duration:** 2 days  
**Depends On:** None (can parallelize with Task 1)  
**Blocks:** Task 5 (Feature Engine refactoring)

**Description:**
Create abstraction layer so features work with any marketplace:
- Define `IMarketplaceExtractor` interface
- Create `MarketplaceExtractorFactory`
- Implement factory to route URL → correct extractor
- Refactor existing `FacebookExtractor` to implement interface

**Files to Create/Modify:**
```
backend/src/marketplace/
├─ IMarketplaceExtractor.ts (interface)
├─ MarketplaceExtractorFactory.ts
├─ providers/
│  ├─ facebook.ts (refactored)
│  └─ yad2.ts (from Task 1)
└─ types/RawListing.ts
```

**Definition of Done:**
- ✅ `IMarketplaceExtractor` interface clear + documented
- ✅ Factory returns correct extractor for URL
- ✅ Facebook extractor still works (backward-compatible)
- ✅ Easy to add new marketplace (just implement interface)

---

#### Backend Task 4: Marketplace Abstraction - Unit Tests (4 cases)
**Owner:** Backend Agent  
**Duration:** 1 day  
**Depends On:** Task 3  
**Blocks:** None

**Test Cases:**
1. Factory returns FacebookExtractor for facebook.com URL ✓
2. Factory returns Yad2Extractor for yad2.co.il URL ✓
3. Factory throws on unsupported marketplace ✓
4. Both extractors implement interface correctly ✓

**Definition of Done:**
- ✅ All 4 tests passing
- ✅ 100% coverage on Factory class

---

#### Backend Task 5: Feature Engine - Seller Intelligence
**Owner:** Backend Agent  
**Duration:** 3 days  
**Depends On:** Task 3 (marketplace abstraction)  
**Blocks:** Task 8 (Verdict Engine)

**Description:**
Implement `extractSellerIntelligence()`:
- Query MongoDB for seller observation history
- Calculate trust score from history (green/yellow/red)
- Fallback: scrape Facebook profile if no history
- Return `SellerIntelligence` object with reasoning

**Files to Create:**
```
backend/src/features/SellerIntelligence.ts
├─ extractSellerIntelligence(rawListing): Promise<SellerIntelligence>
├─ calculateTrustFromHistory(observations): TrustScore
├─ scrapeFacebookProfile(profileUrl): Promise<Profile>
└─ calculateTrustFromProfile(profile): TrustScore
```

**Definition of Done:**
- ✅ Extracts seller name + history
- ✅ Calculates trust score (logic matches design)
- ✅ Fallback scraping works
- ✅ No P2P calls for repeat sellers (instant)
- ✅ Handles missing data gracefully

---

#### Backend Task 6: Feature Engine - Price Intelligence
**Owner:** Backend Agent  
**Duration:** 2 days  
**Depends On:** Task 3  
**Blocks:** Task 8 (Verdict Engine)

**Description:**
Implement `extractPriceIntelligence()`:
- Compare listing price vs. market average (from Stage 1: gatherPrices)
- Calculate gap (absolute + percent)
- Count similar listings
- Return `PriceIntelligence` object with reasoning

**Files to Create:**
```
backend/src/features/PriceIntelligence.ts
├─ extractPriceIntelligence(rawListing, marketData): PriceIntelligence
├─ calculateGap(listingPrice, marketAverage): number
└─ getReasoning(gap, gapPercent): string
```

**Definition of Done:**
- ✅ Compares price vs. market average
- ✅ Shows price gap (% and absolute)
- ✅ Shows count + range of similar listings
- ✅ Reasoning is clear + actionable

---

#### Backend Task 7: Feature Engine - Listing & Market Intelligence
**Owner:** Backend Agent  
**Duration:** 3 days  
**Depends On:** Task 3  
**Blocks:** Task 8 (Verdict Engine)

**Description:**
Implement two features:

**ListingIntelligence:**
- Detect red flags (reuse Phase 1 logic)
- Extract missing items from text
- Detect stock photos (URL-based)
- Calculate listing age from `postedDate`
- Assess condition (excellent/good/fair/poor)

**MarketIntelligence:**
- Calculate demand (high/medium/low based on listing count)
- Assess supply (saturated/balanced/scarce)
- Detect price trend (rising/stable/falling)
- Identify seasonal products

**Files to Create:**
```
backend/src/features/
├─ ListingIntelligence.ts
│  ├─ extractListingIntelligence(rawListing): ListingIntelligence
│  ├─ detectRedFlags(text): string[]
│  ├─ extractMissingItems(text): string[]
│  ├─ detectStockPhotos(images): boolean
│  └─ assessCondition(text, redFlags): Condition
│
└─ MarketIntelligence.ts
   ├─ extractMarketIntelligence(marketData): MarketIntelligence
   ├─ calculateDemand(listingCount): Demand
   ├─ assessSupply(listingCount): Supply
   ├─ detectTrend(priceHistory): Trend
   └─ isSeasonalProduct(category): boolean
```

**Definition of Done:**
- ✅ ListingIntelligence detects all red flags
- ✅ Market assessment logic correct
- ✅ Handles edge cases (no price history, no trend data)

---

#### Backend Task 8: Feature Engine - Unit Tests (24 cases)
**Owner:** Backend Agent  
**Duration:** 3 days  
**Depends On:** Tasks 5, 6, 7  
**Blocks:** None

**Test Cases per Feature:**
- Seller Intelligence: 8 (happy path, no history, scrape fallback, missing data, timeout)
- Price Intelligence: 6 (normal gap, large gap, no market data, outliers)
- Listing Intelligence: 6 (red flags, missing items, stock photos, condition)
- Market Intelligence: 4 (demand, supply, trend, seasonal)

**Definition of Done:**
- ✅ All 24 tests passing
- ✅ 85%+ coverage on feature modules

---

#### Backend Task 9: Verdict Engine - Weighting & Scoring
**Owner:** Backend Agent  
**Duration:** 2 days  
**Depends On:** Tasks 5, 6, 7  
**Blocks:** Task 11 (Extension updates)

**Description:**
Implement `verdictEngine`:
- Take all 4 features as input
- Weight each feature (seller: +2, condition: +3, price: -1, market: 0)
- Calculate final score (1–5 stars)
- Generate human-readable reasoning

**Files to Create:**
```
backend/src/features/VerdictEngine.ts
├─ generateVerdict(features): Verdict
├─ weightFeatures(features): number
├─ calculateConfidence(weightedScore): number
└─ generateReasoning(features, verdict): string
```

**Definition of Done:**
- ✅ Score 1–5 reflects feature quality
- ✅ Confidence is accurate (0–1 scale)
- ✅ Reasoning is clear + ties to data

---

#### Backend Task 10: Verdict Engine - Unit Tests (6 cases)
**Owner:** Backend Agent  
**Duration:** 1 day  
**Depends On:** Task 9  
**Blocks:** None

**Test Cases:**
1. All features green → score 5 ✓
2. Mixed features (green + yellow + red) → score 3 ✓
3. All features red → score 1 ✓
4. High confidence (consistent data) vs low confidence ✓
5. Reasoning ties to feature data ✓
6. Edge case: missing feature → skip weighting ✓

**Definition of Done:**
- ✅ All 6 tests passing
- ✅ 90%+ coverage on VerdictEngine

---

#### Backend Task 11: Extension Updates - Marketplace Detection & Routing
**Owner:** Backend Agent  
**Duration:** 1 day  
**Depends On:** Task 9 (can start earlier if needed)  
**Blocks:** QA testing

**Description:**
Update extension to:
- Detect marketplace (Facebook vs Yad2)
- Show "Analyze" button on both Facebook + Yad2 item pages
- Route POST /analyze with `marketplace` field
- Display 4 features in overlay (seller, price, listing, market)

**Files to Modify:**
```
extension/src/content/worthit-bridge.js
├─ detectMarketplace(url): 'facebook' | 'yad2' | null
├─ extractListing(marketplace): Promise<RawListing>
├─ analyzeProduct(): calls backend with marketplace field
└─ showOverlay(analysis): displays all 4 features

extension/src/popup/worthit-popup.html
├─ Update UI to show 4 feature cards instead of 1
│  ├─ Seller card (trust score, observations)
│  ├─ Price card (gap %, similar count)
│  ├─ Listing card (condition, red flags)
│  └─ Market card (demand, supply)
```

**Definition of Done:**
- ✅ Button shows on Facebook item pages
- ✅ Button shows on Yad2 item pages
- ✅ Button disabled on browse/search pages
- ✅ Overlay displays all 4 features
- ✅ Mobile responsive (tested on phone)

---

#### Backend Task 12: CI/CD & Auto-Deploy to Staging
**Owner:** Backend Agent  
**Duration:** 2 days  
**Depends On:** All other Backend tasks  
**Blocks:** QA testing

**Description:**
Setup automated test gate + staging deployment:
- GitHub Actions workflow runs all tests on PR
- Must pass 100% tests before merge
- On merge to main: auto-build + auto-deploy to staging
- Slack notification on success/failure

**Files to Create:**
```
.github/workflows/test-and-deploy.yml
├─ Trigger on PR + push to main
├─ Run: npm test (all 61 tests)
├─ If tests pass: build extension + backend
├─ Deploy to staging
└─ Slack notification
```

**Definition of Done:**
- ✅ Tests run automatically on PR
- ✅ PR blocks merge if tests fail
- ✅ Auto-deploy to staging on main merge
- ✅ Slack notifications working

---

### STAGE 1: Product Tasks (3 tasks, ~15 days)

#### Product Task 1: Feature Specifications - All 4 Features
**Owner:** Product Agent  
**Duration:** 5 days  
**Depends On:** None  
**Blocks:** QA Task 1 (test planning)

**Description:**
Write detailed specifications for all 4 features:
1. **Seller Intelligence:** Trust scoring logic, data sources, edge cases
2. **Price Intelligence:** Gap calculation, market range display, reasoning
3. **Listing Intelligence:** Red flags, condition assessment, missing items
4. **Market Intelligence:** Demand/supply/trend signals, seasonality

**Deliverables:**
- Spec document for each feature (in PHASE_2_DESIGN_SPEC.md, expand with examples)
- Acceptance criteria per feature
- Edge cases + how to handle
- User-facing copy examples
- Data requirements (what data comes from where)

**Definition of Done:**
- ✅ All 4 specs written + clear
- ✅ Acceptance criteria unambiguous
- ✅ Backend can implement without clarifications
- ✅ QA can write test cases from spec

---

#### Product Task 2: Verdict Algorithm - Weighting Logic
**Owner:** Product Agent  
**Duration:** 3 days  
**Depends On:** Task 1  
**Blocks:** Backend Task 9

**Description:**
Define how to combine 4 features into final verdict:
- Should trust score influence final score? By how much?
- How to handle missing data (seller with no history)?
- When is confidence high vs low?
- Examples: best case (all green) → score 5, worst case (all red) → score 1

**Deliverable:**
- Weighting algorithm document
- Examples: 20 hypothetical listings → expected verdict + reasoning
- Edge cases: what if seller history is missing? What if no price data?

**Definition of Done:**
- ✅ Weighting algorithm clear + testable
- ✅ 20 examples validated with Backend
- ✅ Edge cases handled

---

#### Product Task 3: User-Facing Copy & Messaging
**Owner:** Product Agent  
**Duration:** 3 days  
**Depends On:** Tasks 1–2  
**Blocks:** Extension UI updates

**Description:**
Write copy for:
- Feature card titles + descriptions
- Trust score explanations ("green = trusted seller")
- Price gap messaging ("9% above market")
- Condition assessment explanations
- Market signals ("high demand, scarce supply")
- Final verdict summary

**Deliverable:**
- Copy document with all messaging
- Tone: helpful, not alarmist
- Multilingual (Hebrew + English)

**Definition of Done:**
- ✅ Copy is clear + actionable
- ✅ Matches design mockups
- ✅ Reviewed by QA for clarity

---

### STAGE 1: QA Tasks (4 tasks, ~18 days)

#### QA Task 1: Test Planning - Unit + Integration Tests
**Owner:** QA Agent  
**Duration:** 4 days  
**Depends On:** Product Task 1  
**Blocks:** QA Task 2

**Description:**
Write test plans for all 46 unit + 15 integration tests:
- Define test cases for each feature (46 unit)
- Define integration test scenarios (15)
- Expected inputs + outputs
- Edge cases
- Data setup (mock data, fixtures)

**Deliverable:**
- Test plan document (46 unit + 15 integration)
- Test data fixtures (JSON files with sample listings)
- Test case template (reusable for all tests)

**Definition of Done:**
- ✅ All 61 test cases defined (names, steps, expected results)
- ✅ Test data prepared (fixtures for each scenario)
- ✅ Backend can implement tests from this plan

---

#### QA Task 2: Phase 1 Regression Testing
**Owner:** QA Agent  
**Duration:** 3 days  
**Depends On:** Backend Task 11 (extension updates)  
**Blocks:** QA Task 3

**Description:**
Ensure Phase 1 functionality still works:
- Run all 183 Phase 1 tests
- Manual spot-check: 10 Facebook listings analyzed, verdict unchanged
- Check Phase 1 endpoints: `/analyze`, `/analysis/:id`, `/user/usage`
- Performance: latency not regressed

**Deliverable:**
- Regression test report
- Pass/fail for each test
- Any issues found + severity

**Definition of Done:**
- ✅ All 183 Phase 1 tests passing
- ✅ Manual spot-checks accurate
- ✅ Zero regressions
- ✅ Latency stable

---

#### QA Task 3: Feature Accuracy Testing - Manual E2E
**Owner:** QA Agent  
**Duration:** 5 days  
**Depends On:** QA Task 2 + Backend Task 11  
**Blocks:** Production readiness gate

**Description:**
Manually test 20 real listings (10 Facebook, 10 Yad2):
- Analyze each listing
- Verify verdict matches reality
- Check all 4 features are accurate
- Score accuracy percentage

**Process:**
1. Pick diverse listings (phones, furniture, cars, etc.)
2. Analyze with WorthIT
3. Manually verify each feature:
   - Seller: is trust score accurate?
   - Price: is market comparison correct?
   - Listing: are red flags real?
   - Market: does demand assessment match?
4. Score accuracy

**Deliverable:**
- E2E test report with 20 listings
- Per-feature accuracy scores
- Any issues found
- Recommendation: ready for production? (must be 100%)

**Definition of Done:**
- ✅ 20 listings analyzed (10 Facebook, 10 Yad2)
- ✅ All 4 features verified for accuracy
- ✅ 100% accuracy (no wrong verdicts)
- ✅ Zero critical bugs

---

#### QA Task 4: User-Facing Quality Checklist
**Owner:** QA Agent  
**Duration:** 2 days  
**Depends On:** QA Task 3  
**Blocks:** None (report to Assistant)

**Description:**
Create checklist for assistant to review before production:
- Does the overlay look good? (visual design, readability)
- Is copy clear? (no jargon, actionable)
- Are all 4 features visible?
- Performance acceptable? (< 5s)
- Mobile responsive?
- No errors in console?

**Deliverable:**
- User-facing quality checklist
- Screenshots of overlay
- Any cosmetic issues found

**Definition of Done:**
- ✅ Checklist complete
- ✅ Screenshots attached
- ✅ Ready for assistant review

---

### STAGE 1: Summary

| Agent | Tasks | Days | Dependencies | Deliverables |
|-------|-------|------|--------------|---------------|
| Backend | 12 | 20–25 | None (some parallelize) | Code + 34 unit tests |
| Product | 3 | 15 | None | 3 specs + algorithm + copy |
| QA | 4 | 18 | Backend + Product | 4 test plans + regression report |
| Assistant | N/A | N/A | Ongoing | Unblocking + PR reviews |

**Critical Path:** Marketplace Abstraction → Features → Verdict → Extension (Backend driven)

**Timeline (with concurrent work):**
- Weeks 1–2: Marketplace abstraction + initial features + test planning
- Weeks 3–4: Features complete + testing + regression
- Week 5: Staging + E2E testing + final quality checks
- **Total: 4–5 weeks for Stage 1**

---

## 3. Stage 2: Detailed Task Breakdown (2–3 weeks)

### STAGE 2: Backend Tasks (3 tasks, ~12 days)

#### Backend Task 13: Marketplace Refactoring - Extract Common Logic
**Owner:** Backend Agent  
**Duration:** 3 days  
**Depends On:** Stage 1 complete + all features proven  
**Blocks:** Task 14

**Description:**
Refactor FeatureEngine to be truly marketplace-agnostic:
- Move any Facebook-specific logic out of FeatureEngine
- Ensure all 4 features work with any `RawListing` type
- Test with both Facebook + Yad2 data

**Definition of Done:**
- ✅ FeatureEngine uses only `RawListing` interface (no marketplace-specific fields)
- ✅ Both extractors produce compatible `RawListing` objects
- ✅ No Facebook-specific code in feature modules

---

#### Backend Task 14: Feature Porting - Test & Adjust for Yad2
**Owner:** Backend Agent  
**Duration:** 4 days  
**Depends On:** Task 13  
**Blocks:** Task 15

**Description:**
Run all features against Yad2 data:
- Test seller intelligence on Yad2 (different seller profile structure)
- Test price intelligence on Yad2 prices (different currency/range)
- Test listing intelligence on Yad2 descriptions (different format)
- Test market intelligence on Yad2 market data
- Fix any Yad2-specific quirks

**Definition of Done:**
- ✅ All 4 features work on Yad2
- ✅ Accuracy maintained (if anything, improved)
- ✅ Any Yad2 quirks documented

---

#### Backend Task 15: Performance Optimization - Latency Tuning
**Owner:** Backend Agent  
**Duration:** 3 days  
**Depends On:** Task 14  
**Blocks:** QA Task 5

**Description:**
Ensure < 5s p95 latency:
- Profile code, find bottlenecks
- Optimize queries (add indexes if needed)
- Cache seller profiles (background refresh)
- Parallelize independent operations
- Load test with 100 concurrent requests

**Definition of Done:**
- ✅ < 5s p95 latency for both marketplaces
- ✅ Load test: 100 req/s, < 2% error rate
- ✅ No regressions from Stage 1

---

### STAGE 2: QA Tasks (1 task, ~5 days)

#### QA Task 5: Feature Parity Testing - Yad2
**Owner:** QA Agent  
**Duration:** 5 days  
**Depends On:** Backend Task 15  
**Blocks:** Production readiness

**Description:**
Test all 4 features on Yad2:
- Re-run 20 Yad2 listings (from Stage 1)
- Verify all 4 features still accurate
- Check accuracy didn't drop
- Performance test (latency, load)

**Definition of Done:**
- ✅ 20 Yad2 listings analyzed
- ✅ 100% accuracy maintained
- ✅ < 5s latency p95
- ✅ Ready for production

---

### STAGE 2: Summary

| Agent | Tasks | Days | Deliverables |
|-------|-------|------|--------------|
| Backend | 3 | 12 | Refactored code + performance optimization |
| QA | 1 | 5 | Feature parity report + load test results |

**Timeline: 2–3 weeks**

---

## 4. File Structure & Modules

### New Files to Create

```
backend/
├─ src/
│  ├─ marketplace/
│  │  ├─ IMarketplaceExtractor.ts (interface)
│  │  ├─ MarketplaceExtractorFactory.ts (factory)
│  │  ├─ types/
│  │  │  └─ RawListing.ts
│  │  └─ providers/
│  │     ├─ facebook.ts (refactored from content.ts)
│  │     └─ yad2.ts (NEW)
│  │
│  ├─ features/ (NEW folder)
│  │  ├─ SellerIntelligence.ts
│  │  ├─ PriceIntelligence.ts
│  │  ├─ ListingIntelligence.ts
│  │  ├─ MarketIntelligence.ts
│  │  └─ VerdictEngine.ts
│  │
│  └─ routes/
│     └─ analysis.route.ts (modify /analyze to use factory + features)
│
├─ tests/
│  ├─ unit/
│  │  ├─ yad2.test.ts (8 tests)
│  │  ├─ marketplace-factory.test.ts (4 tests)
│  │  ├─ seller-intelligence.test.ts (8 tests)
│  │  ├─ price-intelligence.test.ts (6 tests)
│  │  ├─ listing-intelligence.test.ts (6 tests)
│  │  ├─ market-intelligence.test.ts (4 tests)
│  │  └─ verdict-engine.test.ts (6 tests)
│  │
│  └─ integration/
│     ├─ yad2-flow.test.ts (4 tests)
│     ├─ facebook-flow.test.ts (4 tests)
│     ├─ features.test.ts (4 tests)
│     ├─ verdict.test.ts (3 tests)
│     └─ phase1-regression.test.ts (183 existing tests)
│
└─ docs/
   ├─ PHASE_2_DESIGN_SPEC.md
   ├─ PHASE_2_IMPLEMENTATION_PLAN.md (this file)
   ├─ MARKETPLACE_ABSTRACTION.md (arch doc)
   └─ YAD2_SCRAPER.md (implementation details)

extension/
├─ src/
│  ├─ content/
│  │  └─ worthit-bridge.js (modify: detect marketplace, route to extractor)
│  │
│  └─ popup/
│     ├─ worthit-popup.html (modify: display 4 features)
│     └─ worthit-popup.css (modify: add feature cards)
│
└─ tests/
   └─ e2e/
      └─ yad2-analysis.test.ts (4 tests: detect, extract, analyze, display)

.github/
└─ workflows/
   └─ test-and-deploy.yml (NEW: auto-test + staging deploy)
```

---

## 5. Task Dependencies & Critical Path

```
┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 1 CRITICAL PATH                                               │
└─────────────────────────────────────────────────────────────────────┘

Backend Task 1 (Yad2 Scraper)                  [2 days]
    ↓
Backend Task 3 (Marketplace Abstraction)       [2 days]
    ↓
Backend Tasks 5, 6, 7 (Features)               [8 days, parallel]
    ↓
Backend Task 9 (Verdict Engine)                [2 days]
    ↓
Backend Task 11 (Extension Updates)            [1 day]
    ├─ Tests run automatically (Task 12 CI/CD)
    ↓
QA Task 3 (E2E Accuracy Testing)               [5 days]
    ↓
PRODUCTION READY ✓

Parallel (Non-Critical):
- Product Tasks 1–3 (Specs + Copy): 11 days
- QA Tasks 1–2 (Test Planning + Regression): 7 days
- These feed into QA Task 3 but don't block critical path

Total: ~20 days (critical path)
With parallelization: ~25 days wall-clock (assuming Backend is solo)
```

---

## 6. Weekly Breakdown

### Week 1 (Days 1–5): Foundation

**Backend:**
- Mon–Tue: Yad2 scraper + tests (Task 1–2)
- Wed–Thu: Marketplace abstraction (Task 3–4)
- Fri: Start seller intelligence (Task 5)

**Product:**
- Mon–Wed: Seller + Price specs (Task 1, part 1)
- Thu–Fri: Start Verdict algorithm (Task 2)

**QA:**
- Mon–Tue: Phase 1 regression plan
- Wed–Fri: Unit test planning (Task 1)

**Assistant:**
- Daily standups + blockers
- Review Backend architecture PRs

---

### Week 2 (Days 6–10): Feature Development

**Backend:**
- Mon–Tue: Seller intelligence (Task 5)
- Wed: Price intelligence (Task 6)
- Thu–Fri: Listing + market intelligence (Task 7)

**Product:**
- Mon–Wed: Listing + market specs (Task 1, parts 3–4)
- Thu–Fri: Final verdict algorithm (Task 2)

**QA:**
- Mon–Wed: Integration test planning (Task 1, part 2)
- Thu–Fri: Prepare test data fixtures

**Assistant:**
- Review feature PRs (architecture + design alignment)
- Unblock any product/backend conflicts

---

### Week 3 (Days 11–15): Testing & Extension

**Backend:**
- Mon–Tue: Unit tests for features (Task 8)
- Wed–Thu: Verdict engine (Task 9–10)
- Fri: Extension updates (Task 11)

**Product:**
- Mon–Tue: User-facing copy (Task 3)
- Wed–Fri: Review + refine

**QA:**
- Mon–Tue: Phase 1 regression (Task 2)
- Wed–Fri: Start E2E testing (Task 3)

**Assistant:**
- Review all PRs
- Prepare staging environment

---

### Week 4 (Days 16–20): QA & Production Prep

**Backend:**
- Mon–Tue: CI/CD setup (Task 12)
- Wed–Fri: Performance tuning

**QA:**
- Mon–Tue: Continue E2E testing (Task 3)
- Wed: User-facing quality (Task 4)
- Thu–Fri: Staging smoke tests

**Product:**
- Mon–Fri: Monitor QA findings, iterate copy if needed

**Assistant:**
- Run final pre-production checklist
- Prepare for production deployment

---

### Week 5 (Days 21–25): Final Push

**Backend:**
- Mon–Tue: Fix any bugs from QA
- Wed–Fri: Performance optimization

**QA:**
- Mon–Fri: Finish E2E testing + regression verification

**Product:**
- Mon–Fri: Support QA, answer clarifications

**Assistant:**
- Daily review of blockers
- Stage 1 readiness gate (all tests passing? E2E accurate? Performance good?)

---

### Stage 2 (Weeks 6–8): 2–3 weeks

**Week 6:**
- Backend: Marketplace refactoring (Task 13)
- QA: Feature parity testing setup

**Week 7:**
- Backend: Feature porting for Yad2 (Task 14)
- QA: Parity testing (Task 5)

**Week 8:**
- Backend: Performance optimization (Task 15)
- QA: Final validation

---

## 7. Definition of "Done" (DoD) Per Task

### Backend Tasks
- ✅ Code merged to main
- ✅ All tests passing (unit + integration + regression)
- ✅ Code reviewed by Assistant (architecture alignment)
- ✅ No code style violations (lint clean)
- ✅ No P0/P1 issues
- ✅ Deployed to staging

### Product Tasks
- ✅ Spec written + documented
- ✅ Reviewed by Backend (feasible?) + QA (testable?)
- ✅ Acceptance criteria unambiguous
- ✅ Copy finalized + approved by QA

### QA Tasks
- ✅ Test cases written
- ✅ Test data prepared
- ✅ Results documented
- ✅ Issues logged (severity + owner)
- ✅ Recommendations provided

### Stage-Level DoD
**Stage 1 Complete When:**
- ✅ All 12 Backend tasks done
- ✅ All 3 Product tasks done
- ✅ All 4 QA tasks done
- ✅ All 61 tests passing (46 unit + 15 integration)
- ✅ Phase 1 regression: 100% passing
- ✅ E2E accuracy: 20/20 analyses correct
- ✅ No P0/P1 bugs
- ✅ Performance: < 5s p95 latency
- ✅ Code coverage: 85%+
- ✅ Ready for staging smoke tests

**Stage 2 Complete When:**
- ✅ All 3 Backend tasks done (refactoring + porting + optimization)
- ✅ All 1 QA task done (feature parity)
- ✅ Features work on both Facebook + Yad2
- ✅ No regressions from Stage 1
- ✅ Performance maintained
- ✅ Ready for production

---

## 8. Blockers & Escalation

**Potential Blockers:**

| Risk | Likelihood | Owner | Resolution |
|------|-----------|-------|-----------|
| Yad2 selectors break (redesign) | Medium | Backend | Use Tavily fallback, update selectors within 1h |
| Seller scraping too slow | Medium | Backend | Cache + history-first approach |
| Feature accuracy poor | Low | QA | Review logic with Product, iterate |
| Team overloaded | Low | Assistant | Cut nice-to-haves (defer to Phase 2B) |

**Escalation Path:**
1. Agent identifies blocker
2. Post to Slack + PHASE_2_BLOCKERS.md
3. If unresolved > 24h: escalate to Assistant
4. Assistant makes decision + posts to Slack

---

## 9. Success Metrics (Recap from Design Spec)

**Stage 1:**
- ✅ Yad2 scraper 95%+ accurate
- ✅ All 4 features working on Facebook
- ✅ 61 tests written + passing (85%+ coverage)
- ✅ < 5s p95 latency
- ✅ Zero P0/P1 bugs
- ✅ E2E: 20/20 analyses accurate

**Stage 2:**
- ✅ Features working on Yad2
- ✅ Backward-compatible
- ✅ Performance maintained

---

## 10. Rollback Plan

### If Critical Issue in Staging
- Revert last commit
- Redeploy previous version
- Time: < 5 minutes
- Slack alert: explain issue + timeline to fix

### If Issue in Production
- **P0 (data loss, security):** Immediate rollback
- **P1 (feature broken):** Rollback within 30 min or hotfix
- **P2 (cosmetic):** Fix + redeploy

---

## 11. Go-Live Checklist

Before deploying to production:

**Code Quality:**
- [ ] All 61 tests passing
- [ ] Phase 1 regression (183 tests) passing
- [ ] Code coverage: 85%+
- [ ] No lint violations
- [ ] No P0/P1 bugs

**QA:**
- [ ] E2E testing: 20/20 accurate
- [ ] Load testing: 100 req/s, < 2% errors
- [ ] Performance: < 5s p95 latency
- [ ] User-facing quality: UI looks good, copy clear

**Infrastructure:**
- [ ] Staging environment stable
- [ ] Monitoring + alerts configured
- [ ] Rollback plan documented
- [ ] Runbook for on-call

**Communication:**
- [ ] Team briefed on launch
- [ ] User communication ready (if needed)
- [ ] Support team trained on new features

---

## Approval & Sign-Off

**This implementation plan is approved by:**
- [ ] Backend Agent (understand tasks + dependencies)
- [ ] Product Agent (understand specs + timeline)
- [ ] QA Agent (understand testing + quality gates)
- [ ] Assistant/You (confirm timeline + resources)

---

## Summary Table

| Phase | Stage | Duration | Agents | Tasks | Tests | Deliverable |
|-------|-------|----------|--------|-------|-------|------------|
| Phase 2 | Stage 1 | 4–5w | All | 19 | 61 | Yad2 + 4 features on Facebook |
| Phase 2 | Stage 2 | 2–3w | Backend + QA | 4 | — | Features on Yad2 + optimization |
| **Total** | — | **6–8w** | **All** | **23** | **61+** | **Complete Phase 2** |

---

**Ready to start Stage 1 with daily standups?**

✅ Yes, launch Monday 9am  
❌ Need adjustments first
