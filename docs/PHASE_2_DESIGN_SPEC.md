# Phase 2 Design Specification

**Date:** 2026-06-23  
**Status:** APPROVED (pending your final confirmation)  
**Scope:** Feature depth (4 intelligence types) + Yad2 marketplace coverage

---

## 1. Executive Summary

Phase 2 transforms WorthIT from a basic price-checker into a **comprehensive deal analyzer**. By adding seller intelligence, listing intelligence, and market intelligence alongside existing price analysis, users get holistic deal confidence.

**Three Stages:**
1. **Stage 1 (Parallel):** Yad2 scraper (Backend) + All 4 features on Facebook (Product/QA)
2. **Stage 2:** Refactor marketplace abstraction, port features to Yad2
3. **Stage 3:** Optimization + extensions (negotiation tips, seller account age, ML-based insights)

**Target Completion:** Stage 1+2 = 8-10 weeks (assuming team capacity, no major blockers)

---

## 2. Architecture Overview

### 2.1 Current MVP Architecture (Reference)

```
┌──────────────────────────────────────────────────────────────────┐
│ PHASE 1 MVP (Current)                                            │
└──────────────────────────────────────────────────────────────────┘

Extension
├─ Popup UI (show analysis button)
└─ Content Script
   └─ Extract listing (title, price, description, image)

           ↓ POST /analyze

Backend
├─ Stage 1: gatherPrices
│  ├─ Query MongoDB (historical observations)
│  └─ Call Tavily (if < 5 observations)
│
└─ Stage 2: runAiAnalysis
   ├─ OpenAI vision (analyze listing + market data)
   └─ Return verdict + confidence

           ↓ Response

Extension
└─ Show overlay (rating, verdict, reasoning)
```

### 2.2 Phase 2 Enhanced Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ PHASE 2 (New)                                                    │
└──────────────────────────────────────────────────────────────────┘

Extension
├─ Detect marketplace (Facebook vs Yad2)
├─ Route to appropriate extractor
└─ Extract listing data

           ↓ POST /analyze { marketplace, ... }

Backend
├─ MarketplaceExtractorFactory
│  ├─ FacebookExtractor implements IMarketplaceExtractor
│  ├─ Yad2Extractor implements IMarketplaceExtractor
│  └─ Returns: RawListing { title, price, desc, seller, images, age }
│
├─ Stage 1: gatherPrices (unchanged)
│  ├─ Query MongoDB
│  └─ Call Tavily
│
├─ Stage 2: runFeatureAnalysis (NEW — enhanced)
│  ├─ Feature 1: SellerIntelligence
│  │  └─ Trust score from history + optional live scrape
│  │
│  ├─ Feature 2: PriceIntelligence
│  │  └─ Market comparison + similar listings count
│  │
│  ├─ Feature 3: ListingIntelligence
│  │  └─ Red flags + age + missing items + stock photos
│  │
│  └─ Feature 4: MarketIntelligence
│     └─ Demand signal + supply saturation + seasonality
│
├─ Stage 3: verdictEngine
│  └─ Weight all features → final verdict + confidence
│
└─ Return: Analysis {
     verdict, confidence, reasoning,
     seller: {...}, price: {...}, listing: {...}, market: {...}
   }

           ↓ Response

Extension
└─ Show rich overlay (all 4 feature insights)
```

### 2.3 Marketplace Abstraction Pattern

**Interface:**
```typescript
interface IMarketplaceExtractor {
  extractListing(url: string): Promise<RawListing>
  validateUrl(url: string): boolean
  supportedDomains: string[]
}

type RawListing = {
  title: string
  price: number
  currency: string
  description: string
  sellerName: string
  sellerProfileUrl?: string
  images: string[]
  postedDate?: Date
  marketplace: 'facebook' | 'yad2'
}
```

**Factory:**
```typescript
class MarketplaceExtractorFactory {
  getExtractor(url: string): IMarketplaceExtractor {
    if (url.includes('facebook.com')) return new FacebookExtractor()
    if (url.includes('yad2.co.il')) return new Yad2Extractor()
    throw new Error('Unsupported marketplace')
  }
}
```

**Feature Engine (Marketplace-Agnostic):**
```typescript
class FeatureEngine {
  analyzeWithAllFeatures(rawListing: RawListing): AnalysisResult {
    return {
      seller: this.extractSellerIntelligence(rawListing),
      price: this.extractPriceIntelligence(rawListing),
      listing: this.extractListingIntelligence(rawListing),
      market: this.extractMarketIntelligence(rawListing)
    }
  }
}
```

---

## 3. Feature Specifications

### 3.1 Feature 1: Seller Intelligence

**Purpose:** Build trust/risk assessment of the seller

**Data Sources:**
- Primary: MongoDB observations (seller history)
- Fallback: Facebook profile scrape (for new sellers)

**Extraction Logic:**
```typescript
interface SellerIntelligence {
  name: string
  trustScore: 'green' | 'yellow' | 'red'
  observations: number  // past listings we've seen
  avgRating?: number    // if available from Facebook
  accountAge?: string   // "2+ years" or "new"
  reasoning: string
}

function extractSellerIntelligence(rawListing: RawListing): SellerIntelligence {
  const history = db.getSellerObservations(rawListing.sellerName)
  
  if (history.length >= 3) {
    // Calculate from history (instant)
    return {
      name: rawListing.sellerName,
      trustScore: calculateTrustFromHistory(history),
      observations: history.length,
      reasoning: `Found ${history.length} past listings from this seller`
    }
  }
  
  // Fallback: scrape profile
  const profile = await scrapeFacebookProfile(rawListing.sellerProfileUrl)
  return {
    name: rawListing.sellerName,
    trustScore: calculateTrustFromProfile(profile),
    observations: 0,
    avgRating: profile.avgRating,
    accountAge: profile.accountAge,
    reasoning: `New seller. Account age: ${profile.accountAge}`
  }
}

function calculateTrustFromHistory(observations): TrustScore {
  // Example logic
  const avgPrice = observations.map(o => o.price).reduce((a,b) => a+b) / observations.length
  const priceVariation = Math.max(...observations) - Math.min(...observations)
  
  if (observations.length >= 5 && priceVariation < avgPrice * 0.2) {
    return 'green'  // many sales, consistent pricing
  } else if (observations.length >= 2) {
    return 'yellow' // some sales, unclear pattern
  } else {
    return 'red'    // very few sales or inconsistent
  }
}
```

**Acceptance Criteria:**
- ✅ Extracts seller name from listing
- ✅ Returns trust score (green/yellow/red)
- ✅ Explains reasoning (history-based or profile-based)
- ✅ No P2P API calls for sellers with history (instant)
- ✅ Graceful fallback if scraping fails

---

### 3.2 Feature 2: Price Intelligence

**Purpose:** Show if this price is good relative to market

**Data Sources:**
- MongoDB observations (same as Phase 1)
- Tavily search (same as Phase 1)
- New: Similar listings count (from observations + Tavily)

**Extraction Logic:**
```typescript
interface PriceIntelligence {
  listingPrice: number
  currency: string
  marketAverage: number
  priceGap: number           // listingPrice - marketAverage
  priceGapPercent: number    // (priceGap / marketAverage) * 100
  similarListingsCount: number
  priceRange: { min: number; max: number }  // market range
  reasoning: string
}

function extractPriceIntelligence(rawListing, marketData): PriceIntelligence {
  const { average, min, max, count } = marketData
  const gap = rawListing.price - average
  const gapPercent = (gap / average) * 100
  
  return {
    listingPrice: rawListing.price,
    currency: rawListing.currency,
    marketAverage: average,
    priceGap: gap,
    priceGapPercent: gapPercent,
    similarListingsCount: count,
    priceRange: { min, max },
    reasoning: gapPercent < -10 
      ? `Price is ${Math.abs(gapPercent).toFixed(1)}% below market average`
      : gapPercent > 10
      ? `Price is ${gapPercent.toFixed(1)}% above market average`
      : `Price matches market average`
  }
}
```

**Acceptance Criteria:**
- ✅ Compares listing price vs. market average
- ✅ Shows price gap (% and absolute)
- ✅ Shows count of similar listings
- ✅ Provides price range (min-max)
- ✅ Reasoning is clear and actionable

---

### 3.3 Feature 3: Listing Intelligence

**Purpose:** Identify red flags and product condition

**Data Sources:**
- Title + description parsing (specs, missing items)
- Image analysis (stock photos)
- Posting date (listing age)
- Red flag keywords (already in Phase 1)

**Extraction Logic:**
```typescript
interface ListingIntelligence {
  redFlags: string[]           // "as-is", "untested", "no charger", etc.
  missingItems: string[]       // "original box", "charger", "controller"
  hasStockPhotos: boolean
  listedAge: string            // "3 days ago", "2 weeks ago"
  condition: 'excellent' | 'good' | 'fair' | 'poor'
  reasoning: string
}

function extractListingIntelligence(rawListing): ListingIntelligence {
  const text = `${rawListing.title} ${rawListing.description}`.toLowerCase()
  
  const redFlags = detectRedFlags(text)  // existing Phase 1 logic
  const missingItems = extractMissingItems(text)
  const hasStockPhotos = detectStockPhotos(rawListing.images)
  const listedAge = calculateAge(rawListing.postedDate)
  const condition = assessCondition(text, redFlags)
  
  const risks = []
  if (redFlags.length > 0) risks.push(`${redFlags.length} red flags detected`)
  if (missingItems.length > 0) risks.push(`Missing: ${missingItems.join(', ')}`)
  if (hasStockPhotos) risks.push('Contains stock photos')
  if (listedAge.includes('week')) risks.push('Old listing (potentially sold)')
  
  return {
    redFlags,
    missingItems,
    hasStockPhotos,
    listedAge,
    condition,
    reasoning: risks.length > 0 
      ? `Concerns: ${risks.join('; ')}`
      : 'No major concerns detected'
  }
}
```

**Acceptance Criteria:**
- ✅ Detects red flags (as-is, untested, missing items, damage, etc.)
- ✅ Extracts missing items from description
- ✅ Identifies stock photos
- ✅ Calculates listing age
- ✅ Assesses condition (excellent/good/fair/poor)

---

### 3.4 Feature 4: Market Intelligence

**Purpose:** Show market demand and supply context

**Data Sources:**
- Similar listings count (from observations + Tavily)
- Price trend (from observations over time)
- Seasonality (manual rules for seasonal products)

**Extraction Logic:**
```typescript
interface MarketIntelligence {
  demand: 'high' | 'medium' | 'low'
  supply: 'saturated' | 'balanced' | 'scarce'
  marketTrend: 'rising' | 'stable' | 'falling'
  isSeasonalProduct: boolean
  seasonalContext?: string
  reasoning: string
}

function extractMarketIntelligence(rawListing, marketData): MarketIntelligence {
  const { count, priceHistory, category } = marketData
  
  // Demand = how many similar listings (fewer = higher demand)
  const demand = count < 5 ? 'high' : count < 20 ? 'medium' : 'low'
  
  // Supply = saturation level
  const supply = count > 30 ? 'saturated' : count > 10 ? 'balanced' : 'scarce'
  
  // Trend = price direction
  const recent = priceHistory.slice(-7)  // last 7 observations
  const avgRecent = recent.reduce((a,b) => a+b) / recent.length
  const avgOlder = priceHistory.slice(0, -7).reduce((a,b) => a+b) / (priceHistory.length - 7)
  const trend = avgRecent > avgOlder * 1.05 ? 'rising' : 
                avgRecent < avgOlder * 0.95 ? 'falling' : 'stable'
  
  // Seasonal = manual rules
  const seasonal = isSeasonalCategory(category)
  
  return {
    demand,
    supply,
    marketTrend: trend,
    isSeasonalProduct: seasonal,
    seasonalContext: seasonal ? getSeasonalContext(category) : undefined,
    reasoning: `${demand} demand, ${supply} market, prices ${trend}. ${count} similar items listed.`
  }
}

function isSeasonalCategory(category: string): boolean {
  const seasonal = ['winter coats', 'air conditioner', 'heater', 'skis', 'beach gear']
  return seasonal.some(s => category.toLowerCase().includes(s))
}
```

**Acceptance Criteria:**
- ✅ Calculates demand signal (high/medium/low)
- ✅ Assesses supply (saturated/balanced/scarce)
- ✅ Detects price trend (rising/stable/falling)
- ✅ Identifies seasonal products
- ✅ Provides context for each signal

---

## 4. Yad2 Integration

### 4.1 Yad2 Scraper Implementation

**File:** `backend/src/marketplace/providers/yad2.ts`

```typescript
class Yad2Extractor implements IMarketplaceExtractor {
  supportedDomains = ['yad2.co.il']
  
  validateUrl(url: string): boolean {
    return url.includes('yad2.co.il') && url.includes('/item/')
  }
  
  async extractListing(url: string): Promise<RawListing> {
    const html = await this.fetchPage(url)
    const dom = new JSDOM(html)
    const document = dom.window.document
    
    return {
      title: document.querySelector('.title')?.textContent || '',
      price: parseInt(document.querySelector('[data-price]')?.textContent || '0'),
      currency: 'ILS',
      description: document.querySelector('.description')?.textContent || '',
      sellerName: document.querySelector('.seller-name')?.textContent || 'Unknown',
      sellerProfileUrl: document.querySelector('.seller-link')?.href,
      images: Array.from(document.querySelectorAll('.gallery-image')).map(img => img.src),
      postedDate: this.parseDate(document.querySelector('.posted-date')?.textContent),
      marketplace: 'yad2'
    }
  }
  
  private async fetchPage(url: string): Promise<string> {
    // Use headless browser or HTTP client
    // Account for JavaScript-rendered content
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0...' }  // avoid detection
    })
    return response.text()
  }
  
  private parseDate(dateStr: string | undefined): Date | undefined {
    if (!dateStr) return undefined
    // Parse "posted 3 days ago" → Date object
    const match = dateStr.match(/(\d+)\s*(hour|day|week)s?\s*ago/)
    if (!match) return undefined
    
    const [, amount, unit] = match
    const now = new Date()
    const subtract = {
      hour: 1000 * 60 * 60,
      day: 1000 * 60 * 60 * 24,
      week: 1000 * 60 * 60 * 24 * 7
    }[unit]
    
    return new Date(now.getTime() - (parseInt(amount) * subtract))
  }
}
```

### 4.2 DOM Selectors (May Need Adjustment)

```typescript
// Based on Yad2's current structure (as of 2026-06-23)
const selectors = {
  title: '.title, h1.item-title',
  price: '[data-price], .price, .item-price',
  description: '.description, .item-description',
  sellerName: '.seller-name, .author-name',
  sellerLink: '.seller-link, a.author-link',
  images: '.gallery-image, .photo, img.item-image',
  postedDate: '.posted-date, .date-posted, time'
}
```

### 4.3 Extension Support

**File:** `extension/src/content/worthit-bridge.js`

```javascript
// Detect marketplace and route accordingly
function detectMarketplace(url) {
  if (url.includes('facebook.com')) return 'facebook'
  if (url.includes('yad2.co.il')) return 'yad2'
  return null
}

// When user clicks "Analyze"
async function analyzeProduct() {
  const marketplace = detectMarketplace(window.location.href)
  if (!marketplace) {
    showError('Marketplace not supported')
    return
  }
  
  const listing = await extractListing(marketplace)
  const analysis = await backend.analyze({
    marketplace,
    ...listing
  })
  
  showOverlay(analysis)
}
```

---

## 5. Data Flow (End-to-End)

```
USER ACTION:
  User opens Yad2 listing → clicks "Analyze" button

EXTRACTION (Extension):
  Extract via Yad2Extractor:
  {
    marketplace: "yad2",
    title: "iPhone 13 Pro Max, 256GB",
    price: 3500,
    description: "Like new, with box and charger...",
    sellerName: "David M",
    images: ["image1.jpg", ...],
    postedDate: "2026-06-20"
  }

TRANSMISSION:
  POST /analyze (same endpoint as Phase 1)
  Backend routes based on marketplace field

BACKEND PROCESSING:
  
  [1] Stage 1: Gather Prices
  ├─ Query MongoDB for similar products
  │  └─ Found 12 iPhone 13 Pro Max listings in database
  │
  └─ Call Tavily (if < 5 observations)
     └─ Found 8 current listings on Yad2 marketplace
  
  Result: { count: 20, average: 3200, min: 2800, max: 3800, priceHistory: [...] }

  [2] Stage 2: Analyze Features
  
  ├─ SellerIntelligence
  │  └─ Query observations for "David M"
  │     └─ Found 3 past listings
  │     └─ Trust: GREEN (consistent pricing, multiple sales)
  │
  ├─ PriceIntelligence
  │  └─ 3500 vs 3200 average = +9.4% above market
  │     └─ Price: YELLOW (slightly high, but reasonable)
  │
  ├─ ListingIntelligence
  │  └─ Parse description:
  │     └─ No red flags
  │     └─ Has box + charger (good condition)
  │     └─ Condition: EXCELLENT
  │
  └─ MarketIntelligence
     └─ 20 similar listings = balanced market
     └─ Price trend: stable (no change in past month)
     └─ Demand: MEDIUM

  [3] Verdict Engine
  ├─ Weight all features:
  │  ├─ Seller trust: +2 points (green)
  │  ├─ Price: -1 point (slightly high)
  │  ├─ Condition: +3 points (excellent)
  │  └─ Market: 0 points (balanced)
  │
  └─ Final score: 4/5 stars
     └─ "Good deal. Trusted seller, excellent condition. Slight premium but worth it."

RESPONSE:
  {
    verdict: 4,
    confidence: 0.92,
    reasoning: "...",
    seller: { trustScore: "green", observations: 3, ... },
    price: { gap: 300, gapPercent: 9.4, similarCount: 20, ... },
    listing: { condition: "excellent", redFlags: [], ... },
    market: { demand: "medium", supply: "balanced", ... }
  }

DISPLAY (Extension):
  Show rich overlay:
  ┌─────────────────────────────────────────────┐
  │ Worth IT Analysis                        4⭐ │
  ├─────────────────────────────────────────────┤
  │                                             │
  │ Seller: TRUSTED ✅                          │
  │ David M — 3+ sales, consistent pricing    │
  │                                             │
  │ Price: 9.4% ABOVE AVERAGE                  │
  │ Market: ₪3,200 (₪2,800–₪3,800 range)       │
  │ 20 similar items listed                    │
  │                                             │
  │ Condition: EXCELLENT 🟢                     │
  │ Has original box & charger                 │
  │                                             │
  │ Verdict: GOOD DEAL                          │
  │ Trusted seller + excellent condition       │
  │ worth the slight premium                   │
  │                                             │
  │ [Save Analysis] [Share]                    │
  └─────────────────────────────────────────────┘
```

---

## 6. API & Data Model Changes

### 6.1 Analysis Endpoint (Existing)

No changes to `/analyze` signature, but response is enhanced:

```typescript
// Input (same as Phase 1)
POST /analyze {
  marketplace: "facebook" | "yad2",  // NEW field
  title: string,
  price: number,
  currency: string,
  description: string,
  images: string[]
}

// Output (enhanced with 4 features)
{
  id: string,
  verdict: 1–5,
  confidence: 0–1,
  reasoning: string,
  
  // NEW: Feature breakdowns
  seller: {
    name: string,
    trustScore: 'green' | 'yellow' | 'red',
    observations: number,
    reasoning: string
  },
  price: {
    listingPrice: number,
    marketAverage: number,
    priceGap: number,
    priceGapPercent: number,
    similarListingsCount: number,
    priceRange: { min, max },
    reasoning: string
  },
  listing: {
    redFlags: string[],
    missingItems: string[],
    hasStockPhotos: boolean,
    listedAge: string,
    condition: 'excellent' | 'good' | 'fair' | 'poor',
    reasoning: string
  },
  market: {
    demand: 'high' | 'medium' | 'low',
    supply: 'saturated' | 'balanced' | 'scarce',
    marketTrend: 'rising' | 'stable' | 'falling',
    isSeasonalProduct: boolean,
    reasoning: string
  },
  
  timestamp: Date,
  marketplace: "facebook" | "yad2"
}
```

### 6.2 MongoDB Schema Changes

**Analysis Collection (new fields):**
```typescript
{
  _id: ObjectId,
  userId: string,
  
  // Extraction
  marketplace: "facebook" | "yad2",
  rawListing: RawListing,
  
  // Analysis stages
  priceData: { average, min, max, count, ... },
  
  // NEW: Feature results
  sellerIntelligence: SellerIntelligence,
  priceIntelligence: PriceIntelligence,
  listingIntelligence: ListingIntelligence,
  marketIntelligence: MarketIntelligence,
  
  // Verdict
  verdict: number,
  confidence: number,
  reasoning: string,
  
  timestamp: Date
}
```

**Add Index (for fast lookups):**
```javascript
db.analyses.createIndex({ marketplace: 1, timestamp: -1 })
db.analyses.createIndex({ "rawListing.sellerName": 1 })
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

**Test Coverage Target: 85%+**

| Module | Test Cases | Examples |
|--------|-----------|----------|
| SellerIntelligence | 8 | happy path, no history, scrape fallback, missing data |
| PriceIntelligence | 6 | normal gap, large gap, no market data, outliers |
| ListingIntelligence | 10 | red flags, missing items, stock photos, condition assessment |
| MarketIntelligence | 6 | demand calc, trend detection, seasonality, edge cases |
| Yad2Extractor | 8 | valid URL, malformed DOM, missing fields, images |
| FacebookExtractor | 4 | regression tests (already have, just add marketplace field) |
| MarketplaceFactory | 4 | correct extractor returned, unsupported URL, fallbacks |

**Total Unit Tests: 46**

### 7.2 Integration Tests

| Test Scenario | Steps | Validation |
|---------------|-------|-----------|
| Full flow: Facebook | POST /analyze → all features → verdict | All 4 features populated, verdict 1–5 |
| Full flow: Yad2 | POST /analyze → all features → verdict | Same, but Yad2 data |
| Seller history fallback | Query history, no live scrape | Trust score instant, reasoning clear |
| Seller history insufficient | Scrape profile + return | Trust score from profile, latency acceptable |
| Price edge case: no market data | Only listing price | Verdict reflects lack of comparison data |
| Listing: many red flags | Parse description → 3+ flags | All flags detected, condition = poor |
| Market: saturated | 50+ similar listings | Supply = saturated, demand = low |

**Total Integration Tests: 15**

### 7.3 E2E Tests (Manual by QA)

| Test | Real Data | Pass Criteria |
|------|-----------|---|
| Analyze 10 real Facebook listings | Real listings from Facebook Marketplace | Analysis matches reality (seller exists, price reasonable, condition accurate) |
| Analyze 10 real Yad2 listings | Real listings from Yad2 | Same accuracy metrics |
| Regression: Phase 1 analyses | Re-run 20 old analyses | Verdict unchanged or improved |

**Acceptance: 100% accuracy (all 20 analyses match reality)**

### 7.4 Quality Gates

**Before Release to Staging:**
- ✅ All 46 unit tests passing
- ✅ All 15 integration tests passing
- ✅ Phase 1 regression tests (183) still passing
- ✅ Code coverage: 85%+
- ✅ No critical issues in code review

**Before Release to Production:**
- ✅ E2E manual testing: 20/20 analyses accurate
- ✅ Staging smoke tests passing
- ✅ Performance: < 5s end-to-end latency p95
- ✅ Zero P0/P1 bugs

---

## 8. Success Criteria

### 8.1 Stage 1 (Yad2 Scraper + Features on Facebook)

- ✅ Yad2 scraper extracts 95%+ of listings correctly
- ✅ All 4 features working on Facebook (100% completion)
- ✅ 61 new tests written (46 unit + 15 integration)
- ✅ Total test count: 244 tests (183 Phase 1 + 61 new)
- ✅ Code coverage: 85%+
- ✅ End-to-end latency: < 5s p95
- ✅ Zero P0/P1 bugs in staging
- ✅ Extension works on both Facebook + Yad2
- ✅ All agent standups posted daily (no blockers > 24h)

### 8.2 Stage 2 (Features Ported to Yad2)

- ✅ All 4 features working on Yad2
- ✅ Marketplace abstraction refactored + tested
- ✅ Backward-compatible (Facebook path unchanged)
- ✅ Total test count: 300+ tests
- ✅ Code coverage: 85%+
- ✅ Latency: < 5s p95 for both marketplaces

### 8.3 Overall Product

- ✅ Users can analyze both Facebook + Yad2 listings
- ✅ Rich verdict: 4 feature insights instead of 1
- ✅ Confident recommendations: "Trusted seller + good price + excellent condition = good deal"
- ✅ Feature depth achieved: comprehensive deal analysis

---

## 9. Risk Analysis

### 9.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Yad2 redesigns → selectors break | Medium | High | DOM monitoring + Tavily fallback (Phase 1 still works) |
| Seller profile scraping slow | Medium | Medium | Cache + background refresh for repeat sellers |
| Feature latency > 5s | Low | High | Profile scraping fallback to history-based only |
| Phase 1 regression in Facebook | Low | High | 183 tests still passing gate |

### 9.2 Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Team can't deliver all 4 features in timeline | Medium | High | Prioritize seller + price + listing, defer market to Phase 2B |
| Accuracy is poor (users find verdict wrong) | Low | High | Manual E2E testing on 20 real listings |

---

## 10. Rollback Plan

If critical issues found:

**Stage 1:**
- If Yad2 scraper broken: Disable Yad2 support, revert to Phase 1 (Facebook only)
- If feature accuracy poor: Revert to Phase 1 verdict logic (single OpenAI call, no feature breakdown)
- If latency > 5s: Disable seller profile scraping, use history-only

**Stage 2:**
- If Yad2 features don't work: Revert marketplace refactor, ship Facebook features separately

**Time to rollback:** < 5 minutes (revert commit + redeploy)

---

## Summary

**Phase 2 delivers:**
1. **Yad2 marketplace support** — DOM scraper, same analysis pipeline
2. **4 feature types** — seller, price, listing, market intelligence
3. **Marketplace abstraction** — reusable pattern for Phase 3 (eBay, Amazon)
4. **85%+ test coverage** — 61 new tests, quality gates locked
5. **Async team coordination** — daily standups, blockers tracked, decisions documented

**Timeline (with 4-person team):**
- Stage 1: 4–5 weeks
- Stage 2: 2–3 weeks
- **Total: 6–8 weeks to full Phase 2 completion**

---

## Approval Checklist

Before proceeding to implementation plan, confirm:

- [ ] All 4 features in Phase 2? ✅ Yes (locked)
- [ ] 85%+ test coverage? ✅ Yes (locked)
- [ ] Hybrid seller data (history + scrape)? ✅ Yes (locked)
- [ ] Stage 1 then Stage 2 approach? ✅ Yes (locked)
- [ ] This design makes sense? ✅ Confirm below

**Design looks good?** ✅ Yes / ❌ Changes needed
