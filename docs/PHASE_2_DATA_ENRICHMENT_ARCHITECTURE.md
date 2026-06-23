# WorthIT: Data Enrichment Architecture

**Purpose:** Design a comprehensive data gathering system that enables accurate AI verdicts on second-hand marketplace listings.

**Status:** Design Phase (Ready for Implementation)  
**Version:** 1.0  
**Date:** 2026-06-23

---

## Problem Statement

**Current Challenge:**
When a user analyzes a marketplace listing (Yad2 or Facebook), we have incomplete information:
- No seller history (new seller = no database records)
- Limited price context (Tavily gives snapshots, not trends)
- No competitive listing comparison
- No market demand signals
- Result: AI gets 10-20% of data needed for accurate verdict

**Goal:**
Design a system that gathers 80%+ of relevant data about a product/seller in < 2 seconds, enabling AI to make **accurate, confident verdicts** on real marketplace listings.

**Success Criteria:**
- Verdicts are based on 50+ data points (not 5-10)
- Confidence scoring is honest (60% confidence when appropriate, not fake 95%)
- Real accuracy: 90%+ on validation set (manually verified against market reality)
- Works for both Yad2 AND Facebook (marketplace-agnostic)
- Handles edge cases (new sellers, new products, no data) gracefully

---

## Architecture Overview

```
USER CLICKS "ANALYZE"
         ↓
    ┌────────────────────────────────────┐
    │   DATA ENRICHMENT ORCHESTRATOR     │
    └────────────────────────────────────┘
         ↓
    ┌────────────────────────────────────────────────┐
    │  Parallel Data Gathering (all sources at once) │
    ├────────────────────────────────────────────────┤
    │  1. Marketplace Extractor                      │
    │     (Yad2: Tavily API | Facebook: DOM scrape)  │
    │  2. Seller Profile Enricher                    │
    │     (Tavily search + historical lookup)        │
    │  3. Market Context Gatherer                    │
    │     (Similar products, prices, demand)         │
    │  4. Competitive Analysis                       │
    │     (Cross-marketplace comparison)             │
    │  5. Trend Analyzer                             │
    │     (Price history, category trends)           │
    └────────────────────────────────────────────────┘
         ↓
    ┌────────────────────────────────────┐
    │   DATA VALIDATOR & NORMALIZER      │
    │   (Consistency, quality checks)    │
    └────────────────────────────────────┘
         ↓
    ┌────────────────────────────────────┐
    │   RICH DATA OBJECT (50+ fields)    │
    │   with confidence scores per field │
    └────────────────────────────────────┘
         ↓
    ┌────────────────────────────────────┐
    │   AI VERDICT ENGINE                │
    │   (Feeds rich data to LLM)         │
    └────────────────────────────────────┘
         ↓
    VERDICT + CONFIDENCE + REASONING
    (e.g., "Worth it, 87% confident, based on:")
    - Price 40% below market
    - Seller has clean history
    - Demand is high (8 similar listings)
```

---

## Data Sources & Collection Strategy

### 1. Marketplace Product Extractor

**Source:** Yad2 or Facebook listing

**Collection Method:**
- **Yad2:** Tavily search for product (returns snippet + URL)
  - Also: Direct Tavily search for "Yad2 [product name]" to get multiple listings context
- **Facebook:** DOM scraper (cheerio) for static HTML content
  - Also: Query Facebook Graph API (if available) for recent prices

**Data Extracted:**
```typescript
{
  // Core product info
  title: string;
  price: number;
  currency: string;
  condition: 'new' | 'excellent' | 'good' | 'fair' | 'poor';
  category: string;
  description: string;
  images: string[];
  postedDate: Date;
  
  // Seller info (linked)
  seller: {
    name: string;
    profileUrl?: string;
    marketplace: 'yad2' | 'facebook';
  };
  
  // Listing-level signals
  redFlags: string[]; // "missing accessories", "stock photo", etc.
  urgencyLanguage: boolean;
  responseTime?: string; // "Usually responds within 2 hours"
}
```

**Performance Target:** < 500ms (Tavily API is fast for Yad2)

---

### 2. Seller Profile Enricher

**Goal:** Build comprehensive seller profile to assess trustworthiness

**Data Sources:**

#### A. Tavily Web Search (Primary)
```typescript
const tavilyQuery = `"${sellerName}" Yad2 seller reviews rating`;
// Returns: seller reputation mentions, past complaints, etc.
```

**Data Extracted:**
- Seller reviews/ratings (if mentioned)
- Complaint patterns ("overpriced seller", "non-responsive", etc.)
- Trust signals ("verified seller", "member since 2015")
- Negative signals ("reported for fraud", "3 complaints")

#### B. Our Database (Historical Lookups)
```typescript
// Query our Analysis collection
const sellerHistory = await Analysis.find({
  'sellerInfo.name': sellerName,
  marketplace: listing.marketplace
}).limit(20).sort({ createdAt: -1 });

// Extract patterns:
// - How often do they list?
// - Price consistency?
// - Any fraud flags in past analyses?
// - Customer satisfaction (from feedback)?
```

**Data Extracted:**
```typescript
{
  name: string;
  
  // Trust signals
  trustScore: number; // 0-100
  trustFactors: {
    hasHistory: boolean;
    listingsCount: number;
    averagePrice: number;
    priceConsistency: number; // 0-100 (how stable are prices?)
    responseRate?: number; // If data available
    positiveRatings?: number;
  };
  
  // Red flags from history
  redFlags: {
    fraudIndicators: string[]; // "overpriced", "stock photos", etc.
    complaintCount: number;
    repeatedIssues: string[];
  };
  
  // Data quality
  confidence: number; // 0-1 (how much do we trust this data?)
  dataPoints: number; // How many historical records?
}
```

**Performance Target:** < 300ms (parallel: DB lookup + Tavily search)

---

### 3. Market Context Gatherer

**Goal:** Understand if this product's price is fair for the category/condition

**Data Sources:**

#### A. Tavily Market Search
```typescript
const queries = [
  `${category} price ${condition} market average 2024`,
  `buy ${productName} online price`,
  `${productName} secondhand market`,
];

// Returns: pricing data from multiple sources
```

**Data Extracted:**
- Average market price (new)
- Average used price
- Price range (min/max)
- Trending direction (prices rising/falling?)
- Seasonal factors ("summer furniture moves slower")

#### B. Our Database Competitive Analysis
```typescript
// Find similar products we've analyzed before
const competitors = await Analysis.find({
  category: listing.category,
  'productInfo.condition': listing.condition,
  marketplace: 'yad2' // or 'facebook'
}).limit(50).sort({ createdAt: -1 });

// Extract:
// - Price distribution (what do similar items sell for?)
// - Velocity (how quickly do they move?)
// - Seller patterns (who dominates this category?)
```

**Data Extracted:**
```typescript
{
  category: string;
  condition: string;
  marketplace: string;
  
  priceContext: {
    newRetailPrice?: number;
    usedMarketAverage: number;
    usedPriceRange: {
      min: number;
      max: number;
      percentile25: number;
      median: number;
      percentile75: number;
    };
    
    // Gap analysis
    thisListingGap: {
      absolute: number; // $ above/below market
      percentage: number; // % above/below
      competitiveness: 'excellent' | 'good' | 'fair' | 'poor' | 'suspicious';
    };
    
    // Market dynamics
    demand: 'high' | 'medium' | 'low'; // based on listing count
    velocity: 'fast' | 'normal' | 'slow'; // how quickly items sell
    trend: 'rising' | 'stable' | 'falling'; // price trend
  };
  
  confidence: number; // 0-1
  dataPoints: number; // # of comparable listings
}
```

**Performance Target:** < 700ms (web search + DB analysis)

---

### 4. Competitive Analysis

**Goal:** Find same/similar products on OTHER marketplaces for price comparison

**Data Sources:**

#### A. Cross-Marketplace Search
```typescript
// If analyzing Yad2 product, search Facebook for same item
// If analyzing Facebook product, search Yad2 for same item

const crossMarketSearch = await Tavily.search(
  `${productName} ${category} -${currentMarketplace}`
);

// Returns listings on other marketplaces at different prices
```

**Data Extracted:**
- Same product price on Facebook vs Yad2
- Same product on eBay/Amazon (if applicable)
- Price deltas between marketplaces
- Which marketplace is "best deal"?

#### B. Seller Cross-Reference
```typescript
// Search if this seller is active on OTHER marketplaces
// (same name pattern, similar products)

const crossMarketSeller = await Tavily.search(
  `"${sellerName}" marketplace -${currentMarketplace} seller`
);
```

**Data Extracted:**
```typescript
{
  crossMarketplaceListings: [
    {
      marketplace: string;
      productName: string;
      price: number;
      currency: string;
      url: string;
      postedDate: Date;
    }
  ];
  
  // Price arbitrage opportunity?
  arbitrageOpportunity: {
    exists: boolean;
    bestPrice: number;
    thisPrice: number;
    savingsPercentage: number;
  };
  
  // Seller multi-market presence
  sellerMultiMarket: {
    activeOn: string[];
    pricePattern: 'consistent' | 'variable' | 'exploitative';
  };
  
  confidence: number;
}
```

**Performance Target:** < 500ms (parallel Tavily searches)

---

### 5. Trend Analyzer

**Goal:** Detect market trends and category-specific signals

**Data Sources:**

#### A. Price History (from our database)
```typescript
// Over last 30 days, how have prices moved for this category?

const priceHistory = await Analysis.aggregate([
  { $match: { category: listing.category, marketplace: 'yad2' } },
  { $group: {
      _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } },
      avgPrice: { $avg: '$productInfo.price' },
      count: { $sum: 1 }
    }
  },
  { $sort: { '_id.month': -1 } },
  { $limit: 12 }
]);
```

#### B. Seasonal Patterns
```typescript
// Is this category seasonal? (furniture in summer, etc.)

const seasonalData = await Analysis.aggregate([
  { $match: { category: listing.category } },
  { $group: {
      _id: { $month: '$createdAt' },
      avgPrice: { $avg: '$productInfo.price' },
      listingCount: { $sum: 1 }
    }
  }
]);
```

#### C. Tavily Trend Search
```typescript
const trendQuery = `${category} market trend 2024 demand supply`;
// Returns: articles about market trends, demand signals
```

**Data Extracted:**
```typescript
{
  category: string;
  
  trends: {
    priceDirection: 'rising' | 'stable' | 'falling';
    priceVelocity: number; // % change per week
    demandLevel: 'high' | 'medium' | 'low';
    listingVelocity: number; // new listings per day
    sellThroughRate: number; // % that sell within 7 days
  };
  
  seasonal: {
    isSeasonal: boolean;
    peakMonths: number[];
    offPeakMonths: number[];
    currentMonthDemand: 'peak' | 'normal' | 'off-peak';
  };
  
  confidence: number;
}
```

**Performance Target:** < 300ms (DB aggregation + Tavily search in parallel)

---

## Rich Data Object Structure

After all sources are gathered, we produce a unified **RichListing** object:

```typescript
export type RichListing = {
  // Original product
  product: {
    title: string;
    price: number;
    currency: string;
    condition: string;
    category: string;
    description: string;
    images: string[];
    postedDate: Date;
    url: string;
    marketplace: 'yad2' | 'facebook';
  };
  
  // Seller profile
  seller: {
    name: string;
    trustScore: number; // 0-100
    trustFactors: { ... };
    redFlags: { ... };
    confidence: number;
  };
  
  // Market context
  market: {
    priceContext: { ... };
    demand: string;
    confidence: number;
  };
  
  // Competitive analysis
  competition: {
    crossMarketplaceListings: { ... };
    arbitrageOpportunity: { ... };
    confidence: number;
  };
  
  // Trends
  trends: {
    priceDirection: string;
    demand: string;
    seasonal: { ... };
    confidence: number;
  };
  
  // Red flags
  redFlags: {
    listing: string[]; // from product extractor
    seller: string[]; // from seller enricher
    market: string[]; // market anomalies
    fraud: string[]; // potential fraud indicators
  };
  
  // Data quality metrics
  dataQuality: {
    totalDataPoints: number; // how much data we gathered
    completeness: number; // 0-1 (what % of possible data do we have?)
    confidenceOverall: number; // 0-1 (how much to trust this data?)
    sources: {
      marketplaceExtractor: boolean;
      sellerEnricher: boolean;
      marketContext: boolean;
      competitiveAnalysis: boolean;
      trends: boolean;
    };
  };
};
```

---

## Confidence Scoring System

**Core Principle:** Be honest about uncertainty. Better to say "45% confident" than fake "95% confident."

### Field-Level Confidence
Each data source reports confidence 0-1:
```typescript
seller: {
  trustScore: 65,
  confidence: 0.72, // "We're 72% sure this is accurate"
  reason: "Based on 5 historical listings, limited data"
}
```

### Verdict-Level Confidence
Final verdict confidence = weighted average of all source confidences:

```typescript
confidenceOverall = (
  seller.confidence * 0.25 +           // Seller matters 25%
  market.confidence * 0.35 +           // Market context matters 35%
  trends.confidence * 0.20 +           // Trends matter 20%
  competition.confidence * 0.15 +      // Competition matters 15%
  (dataQuality.completeness * 0.8)     // Penalize incomplete data
);

// If very little data: cap confidence at 0.4 (honest upper bound)
if (dataQuality.completeness < 0.3) {
  confidenceOverall = Math.min(confidenceOverall, 0.4);
}
```

### Display to User
```
"Worth it - 78% confident"

Confidence breakdown:
┌─────────────────────────────────────┐
│ Based on:                           │
│ • Seller history: Good (8 listings) │
│ • Market price: 40% below average   │
│ • Demand: High (similar items sell) │
│ • Trends: Price rising, good timing │
│                                     │
│ Confidence: 78% (HIGH)              │
│ Data sources: 4/5 available         │
└─────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Data Pipeline (2 weeks)
- [ ] Task 1: Data Enrichment Orchestrator
  - Parallel data gathering architecture
  - Error handling + timeouts
  - Caching strategy (avoid re-querying same seller/product)

- [ ] Task 2: Marketplace Product Extractor (Enhanced)
  - Improve Yad2 extractor (already have Tavily-based extractor)
  - Enhance Facebook extractor (add more fields)
  
- [ ] Task 3: Seller Profile Enricher
  - Tavily seller search
  - Database historical lookup
  - Trust score calculation
  
- [ ] Task 4: Market Context Gatherer
  - Tavily market search
  - Database competitive analysis
  - Price distribution calculation
  
- [ ] Task 5: Competitive Analysis
  - Cross-marketplace search
  - Arbitrage detection
  - Seller multi-market presence
  
- [ ] Task 6: Trend Analyzer
  - Price history aggregation
  - Seasonal pattern detection
  - Market demand signals

### Phase 2: Rich Data Validation (1 week)
- [ ] Data quality checks
- [ ] Normalize currencies/formats
- [ ] Confidence scoring per source
- [ ] Integration tests (ensure all data flows correctly)

### Phase 3: AI Verdict Engine Redesign (1 week)
- [ ] Accept RichListing (not bare product)
- [ ] Prompt engineering (use rich data context)
- [ ] Verdict + confidence output
- [ ] Reasoning extraction

### Phase 4: Real Data Validation (2-3 weeks)
- [ ] Collect 100+ real Yad2 + Facebook listings
- [ ] Manually verify verdicts (is AI recommendation correct?)
- [ ] Measure accuracy: % of verdicts that match reality
- [ ] Iterate on data quality / AI prompts until 90%+ accuracy

### Phase 5: Production Hardening (1 week)
- [ ] Error handling (Tavily down? DB down? Timeouts?)
- [ ] Caching strategy (don't re-query same seller)
- [ ] Rate limiting (respect Tavily API limits)
- [ ] Monitoring (log data quality metrics)

---

## Code Quality Standards

### Enterprise-Level Patterns
1. **Type Safety**
   - All data shapes fully typed (TypeScript `type` exports)
   - No `any` types
   - Strict `tsconfig` settings

2. **Error Handling**
   - Never crash on missing data (graceful degradation)
   - All async operations have timeouts
   - Errors logged + confidence reduced (don't fail silently)

3. **Testing**
   - Unit tests for each data source (mocked)
   - Integration tests with real Tavily API (small quota)
   - E2E tests with real marketplace data
   - Real accuracy validation (manual testing)

4. **Performance**
   - All data sources queried in PARALLEL (not sequential)
   - Target: < 2 seconds total enrichment time
   - Caching for repeat queries (1-hour TTL)
   - Query optimization (indexed MongoDB lookups)

5. **Observability**
   - Log all data sources (what did we find?)
   - Record confidence scores (how much do we trust it?)
   - Track API costs (Tavily calls)
   - Monitor accuracy (% of verdicts correct)

6. **Documentation**
   - Each function has JSDoc with examples
   - Architecture diagrams in code comments
   - Test fixtures show real data examples
   - README explains the whole pipeline

---

## Success Metrics

### Data Quality
- [ ] 50+ data points per listing (target: 80+ for high confidence)
- [ ] 90%+ completeness (how much of possible data gathered?)
- [ ] 80%+ of fields have confidence > 0.7

### Accuracy
- [ ] Test on 100+ real listings (manual verification)
- [ ] Achieve 90%+ verdict accuracy (AI recommendation matches reality)
- [ ] Verdicts with 80%+ confidence are correct 95%+ of time

### Performance
- [ ] Enrichment completes in < 2 seconds
- [ ] No timeouts or data gathering failures
- [ ] Graceful degradation (missing data doesn't crash)

### Code Quality
- [ ] 90%+ test coverage
- [ ] Zero critical bugs
- [ ] All TypeScript types strict
- [ ] Clear, documented codebase

---

## Next Steps

1. **Review this doc** (get feedback, refine architecture)
2. **Start Phase 1: Data Pipeline**
   - Begin with Task 1 (Orchestrator)
   - Then parallel Task 2-6 (data sources)
3. **Real validation early** (don't wait until end)
   - By Task 4, start testing against real Yad2 listings
   - Iterate on data quality based on real results
4. **Team collaboration** (daily standups)
   - Share data insights with QA
   - Validate accuracy together

---

**Owner:** Backend  
**Status:** Design Complete - Ready to Implement  
**Last Updated:** 2026-06-23
