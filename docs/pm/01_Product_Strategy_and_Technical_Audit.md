# WorthIT Product Strategy & Technical Audit

**Created:** June 21, 2026  
**PM:** Claude  
**Status:** Active — Phase 1 Planning

---

## Executive Summary

WorthIT is an AI-powered second-hand marketplace analysis tool that helps buyers and sellers avoid scams and make better purchasing decisions. The product analyzes listings on Facebook Marketplace and Yad2 against real market data, providing a "worth it / maybe / avoid" verdict plus fraud warnings.

**Current State:** Early MVP (v0.1) with core analysis engine functional but missing authentication, user tracking, and multi-marketplace support.

**Next Steps:** Execute Phase 1 (4-5 weeks) to build production-ready MVP for reseller recruitment.

---

## Product Vision

### Problem
Second-hand marketplace users can't distinguish between:
- Fair deals vs overpriced items
- Legitimate sellers vs scammers  
- Stock photos (fraud indicator) vs actual product condition

Users currently resort to ChatGPT + browser tools for help, but results are inconsistent and time-consuming.

### Solution
WorthIT provides a one-click verdict on any marketplace listing. The extension analyzes:
- **Price fairness** — Market data aggregation from Tavily, Yad2, Facebook, eBay, Amazon
- **Fraud indicators** — Stock photos, unrealistic pricing, seller reputation
- **Product condition** — AI analysis of description/images for red flags

### Target Users

**Primary (MVP focus):** Resellers on Facebook Marketplace + Yad2
- Need to price their items competitively
- Want to avoid buying inventory at bad prices
- Understand the market deeply (will give quality feedback)

**Secondary (Phase 3+):** Individual buyers
- Bargain hunters
- First-time second-hand buyers (high scam risk)
- Cross-market shoppers (eBay, Amazon, local marketplaces)

### Business Model

**Phase 1-2:** Free tier + manual recruitment for feedback  
**Phase 3:** Freemium (10 analyses/month free, $4.99/month Pro unlimited)

---

## MVP Roadmap

### Phase 1: MVP for Reseller Recruitment (Weeks 1-5)

**Goal:** Get 10-20 resellers using the product with 1-week trial keys. Gather initial feedback on core value proposition.

**Must-Have Features:**

#### Authentication & Users
- [ ] Real Google Sign-On (replace stub)
- [ ] User model in MongoDB (email, createdAt, trialExpiresAt, tier)
- [ ] Per-user analysis tracking (userId linked to all analyses)
- [ ] Trial key system (1-week free, unlimited analyses, auto-expire)
- [ ] Session management (JWT with 7-day expiry, logout endpoint)

#### Marketplace Integration
- [ ] **Facebook Marketplace** — Improved DOM extractor, stability testing
- [ ] **Yad2** — New DOM extractor or API integration (TBD with backend engineer)
- [ ] Multi-marketplace aggregation (Tavily + local DB works for both FB + Yad2)

#### Fraud Detection
- [ ] Price sanity checks (flag items <$20, vehicles <$500, unrealistic currency)
- [ ] Stock photo detection (warning if image is from Google Images or manufacturer)
- [ ] Facebook seller rating integration (fetch stars, flag 0-rating sellers)
- [ ] Basic red flag warnings (new seller, urgent language, missing photos)

#### Infrastructure
- [ ] Logging & error tracking (Sentry integration)
- [ ] Rate limiting (/analyze endpoint protected)
- [ ] CORS security hardened
- [ ] Database migration system for schema changes
- [ ] Integration tests (real MongoDB, E2E API tests)

**Timeline:**
- Week 1-2: Google OAuth + User model + Trial system + DB refactor
- Week 2-3: Facebook polish + Yad2 integration
- Week 4: Fraud detection + Seller ratings + Logging + Rate limiting
- Week 4.5: Testing + Bug fixes + QA
- Week 5: MVP complete, reseller recruitment begins

**Success Criteria:**
- [ ] 96+ tests passing (unit + integration)
- [ ] Zero critical bugs
- [ ] E2E manual test: Authenticate → Analyze FB listing → Analyze Yad2 listing → See verdict + seller rating
- [ ] All error logs flowing to Sentry
- [ ] Rate limiting tested and working
- [ ] Code reviewed by architecture standards

---

### Phase 2: Reseller Feedback Loop & Polish (Weeks 6-9)

**Goal:** Keep resellers engaged, measure usage, iterate based on real feedback.

**Features (prioritized by Phase 1 feedback):**

- [ ] Per-product deduplication (canonical listing URL, re-analysis detection)
- [ ] User feedback collection ("Was this helpful?" button)
- [ ] Product analysis history (price trend detection, "You analyzed this before")
- [ ] Specs-aware price comparison (filter by RAM/storage/color/condition, not just name)
- [ ] Enhanced seller reputation (historical ratings, scam flags, transaction count)
- [ ] Usage analytics dashboard (analyses/week, verdict accuracy feedback, top products)
- [ ] Analysis versioning (track verdict changes for same listing over time)

**Timeline:**
- Week 6: Collect Phase 1 feedback from resellers
- Weeks 7-8: Build top 3-5 Phase 2 features
- Week 8.5: Deploy, measure engagement
- Week 9: Phase 2 complete

**Expected Outcome:** Resellers are actively using it (2+ analyses/day), high engagement, clear feature prioritization for Phase 3.

---

### Phase 3: Scale & Monetization (Weeks 10-16)

**Goal:** Expand to new markets, add subscription tiers, prepare for paid growth.

**Features:**

- [ ] Multi-provider architecture refactor (pluggable marketplace providers)
- [ ] eBay integration (API-based price lookups, cross-marketplace comparison)
- [ ] Amazon integration (similar to eBay)
- [ ] Subscription tiers (Free 10/month, Pro 100/month, Enterprise unlimited)
- [ ] Billing system (Stripe integration, usage tracking per tier)
- [ ] International expansion (currency normalization, new languages)
- [ ] Advanced fraud detection (ML-based scam scoring, seller behavior analysis)

**Timeline:** 4-6 weeks, dependent on Phase 2 feedback

---

## Timeline to Real Users

```
Week 5 (Friday): Phase 1 MVP Complete
    ↓
Week 5-6: Recruit resellers (Facebook posts + LinkedIn)
    ↓
Week 6-9: Real users testing (Phase 2 active)
    ↓
Week 9 (Friday): Phase 2 Complete
    ↓
Week 9-10: Measure impact, decide Phase 3 scope
    ↓
Week 10-16: Scale & Monetization (Phase 3)
```

**Key Milestones:**
- **Week 5:** First reseller receives trial key
- **Week 6:** 10+ resellers actively using
- **Week 9:** Phase 2 complete, usage metrics show stickiness
- **Week 16:** Subscription tiers live, ready for paid user acquisition

---

## Technical Debt & Gaps Audit

### Summary

Current codebase has **25+ critical gaps** blocking production launch. Below is the complete audit.

---

## Database Schema & Data Organization

### Gap 1.1 — No User/Account Data Structure ⚠️ BLOCKS MVP

**Issue:** Auth is stubbed (randomUUID for userId). No User model exists. Usage tracking is in-memory only.

**Why it matters:** Cannot track per-user analyses, subscription status, trial expiry, or preferences.

**Solution:** Create User collection with fields:
- email (string, unique)
- googleId (string)
- createdAt (date)
- trialExpiresAt (date, nullable)
- tier ('free' | 'pro' | 'enterprise')
- analysesUsedThisMonth (number)
- lastAnalysisAt (date)

**Complexity:** Medium  
**Blocker:** YES — blocks paid tier and user analytics

---

### Gap 1.2 — Analysis Not Linked to User ⚠️ BLOCKS MVP

**Issue:** Analysis documents have no userId field. Cannot retrieve "my past analyses".

**Why it matters:** Users cannot build personal history. Cannot audit trail for debugging.

**Solution:** Add userId field to Analysis schema. Enforce in all queries.

**Complexity:** Small  
**Blocker:** YES — MVP can't show persistence across sessions

---

### Gap 1.3 — No Product Master Table ⚠️ BLOCKS MVP

**Issue:** Each analysis is a new record. Same listing analyzed twice = duplicate records. No deduplication by listing URL.

**Why it matters:** Cannot track "this iPhone 13 listing" over time. Cannot build price trends.

**Solution:** Create Product collection with canonical fields:
- canonicalUrl (string, unique) — e.g., "facebook.com/marketplace/item/123456"
- marketplace ('facebook' | 'yad2' | 'ebay' | 'amazon')
- title (string)
- category (string) — e.g., "Electronics", "Furniture"
- specs (object) — extracted specs (RAM, storage, color, etc.)
- createdAt (date)
- updatedAt (date)

Link Analysis.productId to Product._id.

**Complexity:** Medium  
**Blocker:** YES — blocks trend tracking

---

### Gap 1.4 — Mixed Data Types in Schemas ⚠️ BLOCKS MVP

**Issue:** Analysis.ts uses `Schema.Types.Mixed` for nested objects. No validation on save. Results are type-unsafe.

**Why it matters:** Data corruption risk. No guarantee structure is correct.

**Solution:** Define proper nested schemas for:
- listing (ProductInput)
- verdict (VerdictResult)
- reasoning (ReasoningOutput)
- localMarketContext (MarketContext)
- historicalContext (MarketContext)

**Complexity:** Small  
**Blocker:** YES — affects data integrity

---

### Gap 1.5 — No Analysis Versioning ⚠️ BLOCKS MVP

**Issue:** Each analysis is stored once. No history of how verdict changed.

**Why it matters:** Cannot show "you analyzed this 2 weeks ago at ₪2500, now ₪2200".

**Solution:** Add analysisHistory array to Product collection:
```
analysisHistory: [
  { verdict, reasoning, localMarketContext, timestamp, userId }
]
```

**Complexity:** Small  
**Blocker:** YES — blocks product trends

---

## Mock Data & Seed Data Issues

### Gap 2.1 — No Real Seed Database ⚠️ BLOCKS MVP

**Issue:** When DB is empty, Tavily fallback is used. New deployments have zero market data.

**Why it matters:** MVP doesn't work without manual seeding or extensive Tavily calls.

**Solution:** Create seed script that populates realistic market observations for common products:
- iPhone 13 (various conditions)
- PlayStation 5
- MacBook models
- Gaming laptops
- Furniture categories

**Complexity:** Medium  
**Blocker:** YES — blocks out-of-box experience

---

### Gap 2.2 — Usage Tracker In-Memory ⚠️ BLOCKS MVP

**Issue:** usageTracker.ts holds analysesUsed in module-level variable. Lost on restart.

**Why it matters:** Cannot enforce 15 analyses/month quota in production. Users can exceed by restarting.

**Solution:** Move usage tracking to MongoDB. Track per-user per-month:
```
UsageLog: {
  userId, yearMonth, analysesUsed, createdAt
}
```

Enforce quota check in /analyze endpoint.

**Complexity:** Small  
**Blocker:** YES — blocks monetization

---

## Marketplace Integration Architecture

### Gap 3.1 — No Facebook Marketplace API Integration ⚠️ BLOCKS MVP

**Issue:** Extension extracts data from DOM only. No official Facebook API.

**Why it matters:** Cannot list user's followed items, get notifications, or track seller updates.

**Solution:** Document DOM selectors used. Add fallback selectors for layout changes. Plan for Facebook Graph API in Phase 2.

**Complexity:** Medium (ongoing maintenance)  
**Blocker:** YES — extension breaks with FB redesign

---

### Gap 3.2 — No Multi-Provider Support ⚠️ BLOCKS MVP

**Issue:** Tavily is hardcoded. No provider registry or factory pattern.
- Lines in tavily.ts: `if (query.currency.toUpperCase() !== 'ILS') return []` — hard rejects non-ILS
- priceGathering.ts only calls tavilySearch

**Why it matters:** Adding Yad2, eBay, Amazon requires code changes + redeployment.

**Solution:** 
1. Create MarketDataProvider interface (already exists in types.ts)
2. Build TavilyProvider, Yad2Provider classes
3. Create ProviderRegistry in priceGathering.ts
4. Loop through providers, aggregate results

**Complexity:** Large  
**Blocker:** YES — blocks multi-marketplace

---

### Gap 3.3 — No Provider Rate Limiting or Caching ⚠️ BLOCKS MVP

**Issue:** Each analysis calls Tavily if DB has <5 observations. No backoff, no quota tracking.

**Why it matters:** Tavily can be expensive/rate-limited. Multiple analyses for same product = multiple calls.

**Solution:** 
- Add cache layer for failed queries (don't retry same query for 1 hour)
- Track API calls per minute per provider
- Implement exponential backoff on provider failure

**Complexity:** Medium  
**Blocker:** YES — blocks cost control

---

## Fraud Detection & Red Flags

### Gap 4.1 — No Default Photo Detection ⚠️ BLOCKS MVP

**Issue:** No check if image is stock/manufacturer photo vs actual listing photo.

**Why it matters:** Stock photos = scam indicator.

**Solution:**
- Use reverse image search (Google Images API, TinEye)
- Or hash database of common stock photos
- Or ML model to classify "product photo" vs "stock photo"

**Complexity:** Medium  
**Blocker:** YES — critical for fraud detection

---

### Gap 4.2 — No Price Sanity Check ⚠️ BLOCKS MVP

**Issue:** No validation that price is realistic (1 shekel for car = obviously fake).

**Why it matters:** Typos and scam listings get analyzed anyway.

**Solution:** Add category-based price bounds:
```
categoryBounds: {
  'electronics': { min: 50, max: 100000 },
  'vehicles': { min: 1000, max: 500000 },
  'furniture': { min: 50, max: 50000 }
}
```

Warn if price outside bounds.

**Complexity:** Small  
**Blocker:** YES — blocks MVP quality

---

### Gap 4.3 — Red Flags Not Exposed as Structured Data ⚠️ BLOCKS MVP

**Issue:** Red flags detected in specsExtractor.ts but stored as free text in reasoning.concerns[].

**Why it matters:** Cannot build "fraud score" or show severity levels.

**Solution:** Add RedFlag structured type:
```
RedFlag: {
  category: 'seller' | 'price' | 'condition' | 'photo' | 'description'
  severity: 'caution' | 'warning' | 'high_risk'
  description: string
}
```

Store in Analysis.redFlags[].

**Complexity:** Small  
**Blocker:** NO — MVP works without, but UX is worse

---

## AI Learning Layer

### Gap 5.1 — No Per-Product Learning ⚠️ BLOCKS MVP

**Issue:** Each analysis is stateless. No memory of past analyses of same product.

**Why it matters:** Can't detect "I analyzed this before; price changed".

**Solution:** Query analysisHistory for same product before running new analysis. Use as context in AI prompt.

**Complexity:** Medium  
**Blocker:** YES — blocks trends

---

### Gap 5.2 — No User Feedback Integration ⚠️ BLOCKS MVP

**Issue:** No way to capture "was this verdict accurate?" feedback.

**Why it matters:** Cannot tune AI or validate verdict accuracy.

**Solution:** Add UserFeedback collection:
```
UserFeedback: {
  analysisId, userId, helpful: boolean, accuracy: number (1-5), notes: string
}
```

Store in Analysis for future reference.

**Complexity:** Medium  
**Blocker:** YES — blocks quality improvement

---

## Price Comparison

### Gap 6.1 — No eBay/Amazon Integration ⚠️ BLOCKS PHASE 3

**Issue:** Only Tavily web search. No eBay API, no Amazon PDA.

**Why it matters:** eBay/Amazon have authoritative pricing. Tavily extraction is fragile.

**Solution:** Add eBayProvider, AmazonProvider classes (Phase 3).

**Complexity:** Large  
**Blocker:** NO — Tavily sufficient for MVP

---

### Gap 6.2 — Search Not Spec-Aware ⚠️ BLOCKS MVP

**Issue:** findSimilarObservations() searches by product name only. Doesn't filter by RAM, storage, color, condition.

**Why it matters:** iPhone 13 64GB ≠ iPhone 13 256GB. Comparison is apples-to-oranges.

**Solution:** Extract specs from listing. Filter market observations by specs before computing percentiles.

**Complexity:** Medium  
**Blocker:** YES — affects price accuracy

---

## Authentication & User Data

### Gap 7.1 — Google OAuth Not Implemented ⚠️ BLOCKS MVP

**Issue:** auth.route.ts accepts any non-empty token. No Google JWT validation.

**Why it matters:** Any string is accepted. No real user identity.

**Solution:** Use googleapis library to validate googleToken against Google's public keys. Extract email, picture, name.

**Complexity:** Small  
**Blocker:** YES — blocks authentication

---

### Gap 7.2 — No User Model ⚠️ BLOCKS MVP

**Issue:** No User collection in MongoDB.

**Why it matters:** Cannot store user data, preferences, subscription status.

**Solution:** Create User schema (see Gap 1.1).

**Complexity:** Medium  
**Blocker:** YES — blocks all user features

---

### Gap 7.3 — CORS Security Loose ⚠️ BLOCKS MVP

**Issue:** app.ts: `origin: allowedOrigins ?? true` — defaults to allow all origins.

**Why it matters:** CSRF attacks in production.

**Solution:** Require CORS_ORIGIN env var. Fail on missing value.

**Complexity:** Small  
**Blocker:** YES — security risk

---

### Gap 7.4 — Quota Enforcement Missing ⚠️ BLOCKS MVP

**Issue:** Usage quota (15/month) not enforced per-user or per-day.

**Why it matters:** Free tier is unenforceable.

**Solution:** 
- Check User.analysesUsedThisMonth before /analyze
- Increment after successful analysis
- Reset monthly (via cron job)

**Complexity:** Small  
**Blocker:** YES — blocks monetization

---

## Extension & Client-Side

### Gap 8.1 — DOM Extraction Fragile ⚠️ BLOCKS MVP

**Issue:** extractActiveListing() uses hardcoded selectors. Facebook changes these frequently.

**Why it matters:** Extension breaks with FB redesign. No monitoring of failures.

**Solution:** Add multiple selector fallbacks. Log extraction failures. Plan for Facebook Graph API.

**Complexity:** Medium (ongoing maintenance)  
**Blocker:** YES — MVP breaks with FB update

---

### Gap 8.2 — Image URLs Expire ⚠️ BLOCKS MVP

**Issue:** Facebook image URLs expire. Current code retries without image.

**Why it matters:** Condition analysis loses photo data.

**Solution:** Cache image locally (S3/Cloudinary) on first analysis.

**Complexity:** Medium  
**Blocker:** YES — blocks image analysis

---

## Architecture & Infrastructure

### Gap 9.1 — No Logging or Monitoring ⚠️ BLOCKS MVP

**Issue:** No structured logging, no error tracking service.

**Why it matters:** Production errors are invisible.

**Solution:** Integrate Sentry (or similar). Log all errors with context.

**Complexity:** Medium  
**Blocker:** YES — blocks observability

---

### Gap 9.2 — No Rate Limiting ⚠️ BLOCKS MVP

**Issue:** No express-rate-limit. API endpoints unprotected.

**Why it matters:** Users can spam /analyze, wasting quota.

**Solution:** Add rate limiter middleware. 20 requests/minute per IP.

**Complexity:** Small  
**Blocker:** YES — security/cost

---

### Gap 9.3 — No Integration Tests ⚠️ BLOCKS MVP

**Issue:** Tests mock everything. No real MongoDB, no real Tavily.

**Why it matters:** E2E pipeline untested. Might break in production.

**Solution:** Add integration test suite with:
- Real test MongoDB
- Test Tavily queries (rate-limited)
- E2E API flow tests
- Extension integration tests

**Complexity:** Medium  
**Blocker:** YES — blocks confidence

---

### Gap 9.4 — Verdict Logic AI-Dependent ⚠️ BLOCKS MVP

**Issue:** Current system claims verdict is deterministic (market-based), but LLM controls verdict field.

**Why it matters:** Verdict reliability depends on LLM hallucinations.

**Solution:** Separate concerns:
- Compute market-based verdict (WORTH_IT / MAYBE / AVOID) from percentile logic
- Use LLM only for reasoning/explanation
- If LLM verdict conflicts with market verdict, log and use market verdict

**Complexity:** Medium  
**Blocker:** YES — blocks trust

---

## Gap Summary Table

| Gap | Category | Blocker | Complexity | Status |
|-----|----------|---------|-----------|--------|
| 1.1 | DB Schema | YES | Medium | Critical |
| 1.2 | DB Schema | YES | Small | Critical |
| 1.3 | DB Schema | YES | Medium | Critical |
| 1.4 | DB Schema | YES | Small | Critical |
| 1.5 | DB Schema | YES | Small | Critical |
| 2.1 | Mock Data | YES | Medium | Critical |
| 2.2 | Mock Data | YES | Small | Critical |
| 3.1 | Marketplace | YES | Medium | Critical |
| 3.2 | Marketplace | YES | Large | Critical |
| 3.3 | Marketplace | YES | Medium | Critical |
| 4.1 | Fraud Detection | YES | Medium | Critical |
| 4.2 | Fraud Detection | YES | Small | Critical |
| 4.3 | Fraud Detection | NO | Small | Improvement |
| 5.1 | AI Learning | YES | Medium | Critical |
| 5.2 | AI Learning | YES | Medium | Critical |
| 6.2 | Price Comparison | YES | Medium | Critical |
| 7.1 | Auth | YES | Small | Critical |
| 7.2 | Auth | YES | Medium | Critical |
| 7.3 | Auth | YES | Small | Critical |
| 7.4 | Auth | YES | Small | Critical |
| 8.1 | Extension | YES | Medium | Critical |
| 8.2 | Extension | YES | Medium | Critical |
| 9.1 | Infrastructure | YES | Medium | Critical |
| 9.2 | Infrastructure | YES | Small | Critical |
| 9.3 | Architecture | YES | Medium | Critical |
| 9.4 | Architecture | YES | Medium | Critical |

---

## Critical Path for Phase 1

**Must fix in order:**

1. **User authentication** (Gap 7.1) — Replace stub with real Google OAuth
2. **User model** (Gap 7.2) — Add User collection, store trial status
3. **Link analyses to users** (Gap 1.2) — Add userId field
4. **Quota enforcement** (Gap 7.4) — Move usage tracking to DB
5. **Seed database** (Gap 2.1) — Create realistic market data fixtures
6. **Yad2 integration** (Gap 3.2) — Add DOM extractor or API
7. **Multi-marketplace aggregation** (Gap 3.2) — Loop through providers
8. **Fraud detection basics** (Gaps 4.1, 4.2) — Price sanity + photo detection
9. **Facebook seller ratings** (Gap 4.x) — Fetch and display
10. **Logging & monitoring** (Gap 9.1) — Sentry integration
11. **Rate limiting** (Gap 9.2) — Protect endpoints
12. **Integration tests** (Gap 9.4) — Real DB E2E tests

---

## Next Steps

### For PM (Claude)
- [ ] Answer clarifying questions about Yad2 API, Facebook seller ratings, Tavily budget
- [ ] Create product specification for Phase 1 (detailed feature list)
- [ ] Create backend engineer prompt (database design, API changes)
- [ ] Create QA engineer prompt (test plan for Phase 1)
- [ ] Create architecture review prompt (code quality standards)

### For Founder (Shai)
- [ ] Clarify Yad2 API availability and Facebook seller ratings method
- [ ] Ensure test MongoDB instance is running locally
- [ ] Register Facebook App (for seller ratings API, if needed)
- [ ] Set up Sentry account for error tracking
- [ ] Prepare list of initial resellers to recruit post-Phase 1

### For Backend Engineer
- [ ] Review this audit document
- [ ] Prepare environment (Node setup, MongoDB, test fixtures)
- [ ] Wait for Phase 1 product specification

### For QA Engineer
- [ ] Review this audit document
- [ ] Prepare test environment
- [ ] Wait for Phase 1 test plan

---

## Appendix: Product Spec Questions (Unanswered)

1. **Yad2 Integration:** Does Yad2 have a public API? Or DOM extraction only?
2. **Facebook Seller Ratings:** How do we fetch seller stars (Graph API, DOM extraction, or third-party service)?
3. **Tavily Budget:** Aware of costs? Should we monitor spending?
4. **Team Setup:** Who's building Phase 1? Backend engineer available?
5. **Local Setup:** Node version, MongoDB instance, npm ready?
6. **Success Criteria:** What makes Phase 1 "ready for resellers"?

---

**Document Version:** 1.0  
**Last Updated:** June 21, 2026  
**Next Review:** After Phase 1 completion (Week 5)
