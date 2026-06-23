# Passive Facebook Marketplace Collection: Implementation Plan

**Status:** Ready for Execution  
**Version:** 1.0  
**Date:** 2026-06-23  
**Duration:** 4 weeks (10 tasks)  
**Architecture:** See PHASE_2_PASSIVE_FACEBOOK_COLLECTION.md

---

## Overview

```
PHASE 1 (Week 1): Extension Changes
├─ Task 1: Search page detection + DOM extraction
├─ Task 2: Client-side dedup + batching
└─ Task 3: Extension testing

PHASE 2 (Week 2): Backend Changes
├─ Task 4: Database schema
├─ Task 5: POST /marketplace/observe endpoint
└─ Task 6: Backend testing

PHASE 3 (Week 3): Integration
├─ Task 7: Wire extension to backend
└─ Task 8: E2E verification

PHASE 4 (Week 4): Tasks 7-11 Integration
├─ Task 9: Update Market Context Gatherer
└─ Task 10: Enable feature integration

RESULT: Real marketplace database backing all AI verdicts
```

---

## Phase 1: Extension Changes (Week 1)

### Task 1: Search Page Detection + DOM Extraction

**Duration:** 2 days  
**Owner:** Frontend/Extension  
**Blocks:** Task 2

#### Requirements

Build functions to detect Facebook Marketplace search pages and extract visible listings.

#### Files to Create

```
extension/src/marketplace/
├─ searchDetection.ts (new)
│  ├─ isMarketplaceSearchPage(url: string): boolean
│  ├─ getSearchQuery(url: string): string | null
│  └─ detectMarketplaceType(url: string): 'facebook' | null
│
└─ listingExtractor.ts (new)
   ├─ extractListingsFromSearchPage(): ObservedListing[]
   ├─ extractSingleListing(element: Element): ObservedListing | null
   ├─ extractListingId(url: string): string | null
   ├─ parsePrice(text: string): number
   ├─ extractLocation(element: Element): string | null
   ├─ extractImageUrl(element: Element): string | null
   └─ extractSellerName(element: Element): string | null
```

#### Types

```typescript
export interface ObservedListing {
  marketplace: 'facebook';
  listingId: string;
  listingUrl: string;
  title: string;
  price: number;
  currency: string;
  location?: string;
  imageUrl?: string;
  sellerName?: string;
  searchQuery: string;
  observedAt: Date;
}
```

#### Implementation Details

**Search Page Detection:**
```typescript
function isMarketplaceSearchPage(url: string): boolean {
  // Match:
  // https://www.facebook.com/marketplace/search/?query=ps5
  // https://www.facebook.com/marketplace/telaviv/search/?query=iphone
  // https://m.facebook.com/marketplace/search/?query=...
  
  const patterns = [
    /facebook\.com\/marketplace\/.*\/search/i,
    /facebook\.com\/marketplace\/search/i,
    /m\.facebook\.com\/marketplace\/search/i,
  ];
  
  return patterns.some(p => p.test(url));
}
```

**DOM Extraction:**
- Use multiple fallback selectors (data-testid first, then class-based)
- Extract: title, price, seller, location, image, URL
- Handle missing fields gracefully (return null if can't extract)
- Return array of ObservedListing objects

**Edge Cases to Handle:**
- Missing seller name (use empty string)
- No image (use undefined)
- Invalid price (return 0)
- Malformed URL (return null for that listing)

#### Tests

Write unit tests for:
1. Search page detection (various URL formats)
2. Search query extraction
3. DOM extraction with mock HTML (10+ listings)
4. Price parsing (various formats: "₪1,700", "$500", "1700")
5. Location extraction
6. Seller name extraction
7. Edge cases (missing fields, malformed data)

**Test file:** `extension/tests/unit/searchDetection.test.ts`

#### Definition of Done

- ✅ All URL patterns detected correctly
- ✅ Search query extracted from URL
- ✅ Listings extracted from mock Facebook HTML
- ✅ Handles 95%+ of Facebook's current DOM structure
- ✅ Graceful degradation (missing fields don't crash)
- ✅ All unit tests passing (15+ tests)
- ✅ TypeScript compiles
- ✅ No console errors

---

### Task 2: Client-Side Deduplication + Batching

**Duration:** 1.5 days  
**Owner:** Frontend/Extension  
**Depends On:** Task 1  
**Blocks:** Task 3

#### Requirements

Implement in-memory deduplication to prevent duplicate observations in same session, and batch collection to send efficiently.

#### Files to Create

```
extension/src/marketplace/
└─ MarketplaceObserver.ts (new)
   ├─ class MarketplaceObserver
   ├─ addObservations(listings: ObservedListing[]): void
   ├─ flushBatch(): Promise<void>
   ├─ private shouldObserveListing(listingId: string): boolean
   └─ private batchManager (timer, size tracking)
```

#### Implementation Details

**Client-Side Deduplication:**
```typescript
class MarketplaceObserver {
  private observedListings: Set<string> = new Set();
  private batch: ObservedListing[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  
  private readonly BATCH_SIZE = 20;
  private readonly BATCH_TIMEOUT_MS = 30000; // 30 seconds
  
  addObservations(listings: ObservedListing[]): void {
    // Filter out duplicates
    const newListings = listings.filter(l => {
      if (this.observedListings.has(l.listingId)) {
        return false; // Already observed
      }
      this.observedListings.add(l.listingId);
      return true;
    });
    
    if (newListings.length === 0) return;
    
    this.batch.push(...newListings);
    
    // Send if batch is full
    if (this.batch.length >= this.BATCH_SIZE) {
      this.flushBatch();
    } else if (!this.batchTimer) {
      // Set timer for eventual send
      this.batchTimer = setTimeout(
        () => this.flushBatch(),
        this.BATCH_TIMEOUT_MS
      );
    }
  }
  
  private async flushBatch(): Promise<void> {
    if (this.batch.length === 0) return;
    
    const toSend = [...this.batch];
    this.batch = [];
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    try {
      const response = await fetch('/marketplace/observe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observations: toSend,
          timestamp: new Date(),
        }),
      });
      
      if (!response.ok) {
        console.warn(`[WorthIT] Observation batch failed: ${response.status}`);
        // Optionally retry or log
      } else {
        console.log(`[WorthIT] Sent ${toSend.length} observations`);
      }
    } catch (e) {
      console.error('[WorthIT] Failed to send observations:', e);
    }
  }
}
```

**Session Management:**
```typescript
// Clear dedup set on page unload
window.addEventListener('beforeunload', () => {
  observer.flushBatch(); // Send final batch
  observer.clearObservedListings();
});

// Detect navigation (SPA)
let lastUrl = window.location.href;
setInterval(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    if (!isMarketplaceSearchPage(lastUrl)) {
      observer.flushBatch();
      observer.clearObservedListings();
    }
  }
}, 500);
```

#### Tests

Unit tests for:
1. Deduplication (add same listing twice, only send once)
2. Batch accumulation (add 30 items, verify sent in 2 batches)
3. Batch timeout (add 5 items, wait 30s, verify sent)
4. Batch size limit (add 20 items, verify immediate send)
5. Error handling (network failure, retry logic)
6. Session clear (page unload → clear set)

**Test file:** `extension/tests/unit/MarketplaceObserver.test.ts`

#### Definition of Done

- ✅ In-memory Set prevents duplicates
- ✅ Observations batched (20 items or 30 seconds)
- ✅ Batch sends to `/marketplace/observe`
- ✅ Session cleared on page unload
- ✅ Error handling (network failures don't crash)
- ✅ Logging for debugging
- ✅ All unit tests passing (8+ tests)
- ✅ No memory leaks (batches cleared)

---

### Task 3: Extension Testing (Manual + Integration)

**Duration:** 1 day  
**Owner:** Frontend/Extension  
**Depends On:** Tasks 1-2

#### Requirements

Verify that the full extension flow works on real Facebook Marketplace search pages.

#### Test Scenarios

1. **Real Search Page Detection**
   - Navigate to Facebook Marketplace search
   - Verify extension detects search page
   - Check console logs show detection

2. **DOM Extraction**
   - Verify 20+ listings are extracted
   - Check each listing has: title, price, seller, URL
   - Verify listing IDs are valid

3. **Client Deduplication**
   - Scroll the search page (load more listings)
   - Verify no duplicate listings in same batch
   - Check observedListings Set is updated

4. **Batch Sending**
   - Monitor network tab (DevTools)
   - Verify POST requests to `/marketplace/observe`
   - Check batch size (20 items per request)
   - Check request payload format

5. **Error Handling**
   - Disconnect network
   - Load search page
   - Verify graceful failure (no crashes)
   - Reconnect and verify recovery

6. **Session Management**
   - Load search page A
   - Navigate to search page B
   - Verify observations sent for page A
   - Verify Set cleared between pages

#### Documentation

Create manual test checklist:
- File: `extension/tests/manual/PASSIVE_COLLECTION_TEST_CHECKLIST.md`
- Include: steps, expected results, pass/fail

#### Definition of Done

- ✅ All 6 test scenarios verified
- ✅ Real Facebook search page tested
- ✅ Network requests verified (DevTools)
- ✅ No console errors
- ✅ Manual test checklist signed off
- ✅ Ready for backend integration

---

## Phase 2: Backend Changes (Week 2)

### Task 4: Database Schema

**Duration:** 1.5 days  
**Owner:** Backend  
**Blocks:** Tasks 5-6

#### Requirements

Create Listings collection with proper schema and indexes for storing marketplace observations.

#### Files to Create

```
backend/src/database/models/
└─ Listing.ts (new)
   └─ ListingSchema + indexes
```

#### Schema

```typescript
interface Listing extends Document {
  // Identifiers
  idempotentKey: string; // "facebook:1367953568531456"
  marketplace: 'facebook' | 'yad2';
  listingId: string;
  listingUrl: string;
  
  // Product Info
  title: string;
  description?: string;
  category?: string;
  
  // Current State
  currentPrice: number;
  currency: string;
  location?: string;
  imageUrl?: string;
  sellerName?: string;
  condition?: 'new' | 'excellent' | 'good' | 'fair' | 'poor';
  
  // Observation Tracking
  firstSeenAt: Date;
  lastSeenAt: Date;
  observationCount: number;
  
  // Price History
  priceHistory: Array<{
    price: number;
    timestamp: Date;
  }>;
  
  // Search Context
  searchQueries: string[];
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}
```

#### Indexes

```typescript
// Deduplication
Listing.collection.createIndex({ idempotentKey: 1 }, { unique: true });

// Query performance
Listing.collection.createIndex({ marketplace: 1, listingId: 1 });
Listing.collection.createIndex({ category: 1, searchQueries: 1 });
Listing.collection.createIndex({ lastSeenAt: -1 });
Listing.collection.createIndex({ 'priceHistory.timestamp': -1 });
```

#### Definition of Done

- ✅ Listing model created with proper types
- ✅ All required fields present
- ✅ Indexes created and tested
- ✅ Deduplication index is unique
- ✅ TypeScript compiles
- ✅ Migration script (if needed) works
- ✅ Ready for endpoints

---

### Task 5: POST /marketplace/observe Endpoint

**Duration:** 2 days  
**Owner:** Backend  
**Depends On:** Task 4  
**Blocks:** Task 6

#### Requirements

Create endpoint to receive, validate, and store marketplace observations.

#### Files to Create

```
backend/src/routes/
└─ marketplace.routes.ts (new)
   ├─ POST /marketplace/observe
   └─ processObservation(obs: ObservedListing)

backend/src/marketplace/
└─ observationService.ts (new)
   ├─ storeObservation(obs: ObservedListing)
   ├─ updateExistingListing(listing: Listing, obs: ObservedListing)
   └─ createNewListing(obs: ObservedListing)
```

#### Endpoint Specification

**Route:** `POST /marketplace/observe`

**Authentication:** None (public endpoint)

**Rate Limiting:** None (very low cost)

**Request Body:**
```typescript
{
  observations: ObservedListing[];
  timestamp: Date;
}
```

**Response:**
```typescript
{
  success: boolean;
  processed: number;
  details: Array<{
    listingId: string;
    action: 'created' | 'updated';
    priceChanged?: boolean;
  }>;
}
```

#### Implementation

```typescript
app.post('/marketplace/observe', async (req, res) => {
  try {
    const { observations } = req.body;
    
    // Validate input
    if (!Array.isArray(observations) || observations.length === 0) {
      return res.status(400).json({ error: 'Invalid observations' });
    }
    
    // Validate each observation
    const validObservations = observations.filter(obs => {
      return obs.marketplace === 'facebook' &&
             obs.listingId &&
             obs.listingUrl &&
             obs.title &&
             obs.price >= 0;
    });
    
    if (validObservations.length === 0) {
      return res.status(400).json({ error: 'No valid observations' });
    }
    
    // Process each observation
    const results = await Promise.all(
      validObservations.map(obs => processObservation(obs))
    );
    
    res.status(200).json({
      success: true,
      processed: results.length,
      details: results,
    });
    
  } catch (e) {
    console.error('[/marketplace/observe] Error:', e);
    res.status(500).json({ error: 'Failed to process observations' });
  }
});

async function processObservation(obs: ObservedListing) {
  const idempotentKey = `${obs.marketplace}:${obs.listingId}`;
  
  let listing = await Listing.findOne({ idempotentKey });
  
  if (!listing) {
    // NEW: Create
    listing = new Listing({
      idempotentKey,
      marketplace: obs.marketplace,
      listingId: obs.listingId,
      listingUrl: obs.listingUrl,
      title: obs.title,
      currentPrice: obs.price,
      currency: obs.currency,
      location: obs.location,
      imageUrl: obs.imageUrl,
      sellerName: obs.sellerName,
      
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      observationCount: 1,
      
      priceHistory: [{ price: obs.price, timestamp: new Date() }],
      searchQueries: [obs.searchQuery],
    });
    
    await listing.save();
    return { listingId: obs.listingId, action: 'created' };
    
  } else {
    // EXISTING: Update
    const priceChanged = listing.currentPrice !== obs.price;
    
    listing.lastSeenAt = new Date();
    listing.observationCount += 1;
    
    if (priceChanged) {
      listing.currentPrice = obs.price;
      listing.priceHistory.push({
        price: obs.price,
        timestamp: new Date(),
      });
    }
    
    if (obs.searchQuery && !listing.searchQueries.includes(obs.searchQuery)) {
      listing.searchQueries.push(obs.searchQuery);
    }
    
    await listing.save();
    return { listingId: obs.listingId, action: 'updated', priceChanged };
  }
}
```

#### Edge Cases

1. **Duplicate in same batch** → Last one wins (idempotent)
2. **Missing optional fields** → Accepted (defaults to undefined)
3. **Price changes** → Tracked in priceHistory
4. **Search query changes** → Added to array
5. **Concurrent requests** → MongoDB unique index prevents duplicates

#### Definition of Done

- ✅ Endpoint created and working
- ✅ Input validation present
- ✅ Idempotent upsert (no duplicates)
- ✅ Price history tracked
- ✅ Search queries accumulated
- ✅ observationCount incremented
- ✅ Response format matches spec
- ✅ Error handling complete

---

### Task 6: Backend Testing

**Duration:** 1.5 days  
**Owner:** Backend  
**Depends On:** Task 5

#### Requirements

Comprehensive testing of the observation endpoint and storage logic.

#### Tests

Unit tests:
1. Validation (invalid input, missing fields)
2. Creating new listing
3. Updating existing listing
4. Price change tracking
5. Search query accumulation
6. observationCount increment
7. Concurrent request handling
8. Duplicate prevention (unique index)

Integration tests:
1. End-to-end: POST request → DB update
2. Multiple observations in one batch
3. Same listing in multiple batches
4. Batch with mixed new/existing listings

**Test file:** `backend/tests/integration/marketplace.observe.test.ts`

#### Definition of Done

- ✅ All 8 unit tests passing
- ✅ All 4 integration tests passing
- ✅ No duplicate listings in DB
- ✅ Price history accurate
- ✅ observationCount correct
- ✅ Response format validated
- ✅ 209+ total tests passing (no regressions)

---

## Phase 3: Integration (Week 3)

### Task 7: Wire Extension to Backend

**Duration:** 1.5 days  
**Owner:** Frontend/Extension  
**Depends On:** Tasks 3, 6

#### Requirements

Connect the extension's observation collection to the backend endpoint.

#### Changes

**Update extension manifest/background script:**
```typescript
// extension/src/background/observation.ts

// Start observation on search pages
chrome.webNavigation.onCommitted.addListener((details) => {
  if (isMarketplaceSearchPage(details.url)) {
    chrome.tabs.sendMessage(details.tabId, { action: 'startObserving' });
  }
});

// Listen for observation batches from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendObservations') {
    sendObservationBatch(request.observations).then(sendResponse);
    return true; // Will respond asynchronously
  }
});

async function sendObservationBatch(observations: ObservedListing[]) {
  try {
    const response = await fetch('https://api.worthit.local/marketplace/observe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        observations,
        timestamp: new Date(),
      }),
    });
    
    return {
      success: response.ok,
      processed: response.ok ? observations.length : 0,
    };
  } catch (e) {
    console.error('[WorthIT] Observation batch failed:', e);
    return { success: false, processed: 0, error: String(e) };
  }
}
```

**Update content script:**
```typescript
// extension/src/content/observer.ts

const observer = new MarketplaceObserver();

// Listen for start signal from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startObserving') {
    startObservingSearchPage();
  }
});

// Override flushBatch to send via background script
class ExtensionMarketplaceObserver extends MarketplaceObserver {
  protected async flushBatch(): Promise<void> {
    if (this.batch.length === 0) return;
    
    const toSend = [...this.batch];
    this.batch = [];
    
    // Send via background script (handles CORS)
    chrome.runtime.sendMessage({
      action: 'sendObservations',
      observations: toSend,
    });
  }
}
```

#### Definition of Done

- ✅ Extension sends observations to correct backend endpoint
- ✅ CORS handled correctly (chrome://extensions vs localhost)
- ✅ Error handling if backend is down
- ✅ Logging for debugging
- ✅ No console errors
- ✅ Manual test: real observations sent to backend

---

### Task 8: E2E Verification

**Duration:** 1 day  
**Owner:** Backend + Frontend  
**Depends On:** Task 7

#### Requirements

Verify complete flow from extension extraction to database storage.

#### Test Scenarios

1. **Search Page → Observation Sent → DB Stored**
   - Load Facebook search page
   - Verify listings extracted
   - Monitor network (POST /marketplace/observe)
   - Query DB and verify listings created

2. **Duplicate Prevention**
   - Same search page, different user
   - Verify only one listing in DB (unique constraint)
   - Verify observationCount = 2

3. **Price Change Tracking**
   - First observation: $500
   - Second observation: $450
   - Verify priceHistory has both
   - Verify currentPrice = $450

4. **Search Query Accumulation**
   - Observation 1: searchQuery = "ps5"
   - Observation 2: searchQuery = "playstation 5"
   - Verify listing has both searches in array

5. **Stress Test**
   - Send 1,000 observations in 10 batches
   - Verify all stored (or updated) correctly
   - Check for DB errors in logs

#### Monitoring

```bash
# Terminal 1: Backend logs
npm run dev

# Terminal 2: Monitor DB
db.listings.count()
db.listings.findOne()

# Terminal 3: Load extension + navigate
# Open Facebook search page
# Check DevTools network tab
# Verify POST requests
```

#### Definition of Done

- ✅ Full flow works end-to-end
- ✅ Listings stored in DB
- ✅ Duplicates prevented
- ✅ Price history tracked
- ✅ No data loss
- ✅ Performance acceptable (< 500ms response)
- ✅ Ready for Tasks 7-11 integration

---

## Phase 4: Tasks 7-11 Integration (Week 4)

### Task 9: Update Market Context Gatherer (Task 7-11 Integration)

**Duration:** 2 days  
**Owner:** Backend  
**Depends On:** Task 8  
**Blocks:** Task 10

#### Requirements

Update Task 9 (Market Context Gatherer) from Tasks 7-11 plan to use real collected data instead of relying solely on Tavily.

#### Implementation

**Before (without Passive Collection):**
```typescript
async function gatherMarketContext(raw: RawListing): Promise<MarketData> {
  // Only Tavily
  return await tavilyMarketSearch(raw);
}
```

**After (with Passive Collection):**
```typescript
async function gatherMarketContext(raw: RawListing): Promise<MarketData> {
  // Query our internal database first
  const similarListings = await Listing.find({
    category: raw.category,
    currency: raw.currency,
    marketplace: 'facebook',
    lastSeenAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) }, // Last 7 days
  }).limit(500);
  
  if (similarListings.length > 50) {
    // We have real data! Use it.
    const prices = similarListings.map(l => l.currentPrice);
    
    return {
      priceContext: {
        newRetailPrice: null,
        usedMarketAverage: mean(prices),
        usedPriceRange: {
          min: Math.min(...prices),
          max: Math.max(...prices),
          percentile25: percentile(prices, 0.25),
          median: percentile(prices, 0.50),
          percentile75: percentile(prices, 0.75),
        },
        
        // Gap analysis
        thisListingGap: {
          absolute: raw.price - mean(prices),
          percentage: ((raw.price - mean(prices)) / mean(prices)) * 100,
          competitiveness: calculateCompetitiveness(raw.price, mean(prices)),
        },
        
        // Market dynamics
        demand: assessDemandFromListingCount(similarListings.length),
        velocity: calculateVelocityFromPriceHistory(similarListings),
        trend: calculateTrendFromPriceHistory(similarListings),
      },
      
      confidence: Math.min(1.0, similarListings.length / 100), // 50 listings = 50% confident
      dataPoints: similarListings.length,
    };
    
  } else {
    // Fallback: Not enough data, use Tavily
    const tavilyResult = await tavilyMarketSearch(raw);
    return {
      ...tavilyResult,
      confidence: (tavilyResult.confidence || 0.5) * 0.5, // Reduce confidence (estimate)
    };
  }
}
```

#### Helper Functions

```typescript
function mean(values: number[]): number {
  return values.reduce((a, b) => a + b) / values.length;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * p) - 1;
  return sorted[index];
}

function assessDemandFromListingCount(count: number): 'high' | 'medium' | 'low' {
  if (count > 100) return 'high';
  if (count > 30) return 'medium';
  return 'low';
}

function calculateCompetitiveness(price: number, marketAvg: number): 'excellent' | 'good' | 'fair' | 'poor' | 'suspicious' {
  const gap = ((price - marketAvg) / marketAvg) * 100;
  if (gap < -15) return 'excellent'; // 15%+ below
  if (gap < -5) return 'good';
  if (gap < 10) return 'fair';
  if (gap < 25) return 'poor';
  return 'suspicious'; // 25%+ above
}

function calculateVelocityFromPriceHistory(listings: Listing[]): 'fast' | 'normal' | 'slow' {
  // If prices changing quickly, items are moving fast
  const historyLengths = listings.map(l => l.priceHistory.length);
  const avgHistoryLength = mean(historyLengths);
  
  if (avgHistoryLength > 3) return 'fast'; // Prices change often = fast moving
  if (avgHistoryLength > 1) return 'normal';
  return 'slow';
}

function calculateTrendFromPriceHistory(listings: Listing[]): 'rising' | 'stable' | 'falling' {
  // Look at price changes over time
  let up = 0, down = 0;
  
  listings.forEach(listing => {
    if (listing.priceHistory.length > 1) {
      const first = listing.priceHistory[0].price;
      const last = listing.priceHistory[listing.priceHistory.length - 1].price;
      if (last > first) up++;
      else if (last < first) down++;
    }
  });
  
  if (up > down) return 'rising';
  if (down > up) return 'falling';
  return 'stable';
}
```

#### Definition of Done

- ✅ Market Context Gatherer queries Listings collection first
- ✅ Fallback to Tavily if insufficient data
- ✅ Confidence scoring based on sample size
- ✅ Price history analysis working
- ✅ All helper functions tested
- ✅ Integration with Tasks 7-11 flow

---

### Task 10: Enable Feature Integration

**Duration:** 1.5 days  
**Owner:** Backend  
**Depends On:** Task 9

#### Requirements

Integrate Passive Collection data with remaining features and ensure all Tasks 7-11 can leverage it.

#### Updates Needed

**1. Seller Intelligence (Task 8 from Tasks 7-11)**
- Query Listings for past seller observations
- Use observationCount as trust indicator
- Link seller tracking to Listings

**2. Price Intelligence (Task 6 from Tasks 7-11)**
- Already using Market Context Gatherer
- Now gets real price history
- Confidence based on observation count

**3. Listing Intelligence (Task 7 from Tasks 7-11)**
- Can compare to historical listings
- Flag anomalies (title too different, etc.)

**4. Market Intelligence (Task 11 from Tasks 7-11)**
- Demand: Use listing count from Listings collection
- Supply: Use search frequency from searchQueries array
- Trend: Use priceHistory trend calculation
- Seasonal: Compare across months

#### Integration Points

```typescript
// In DataEnrichmentOrchestrator (Task 6-NEW from earlier):
// Update data sources to use Listings collection when available

async function enhanceProduct(raw: RawListing): Promise<ProductData> {
  // Check if we have historical data
  const listing = await Listing.findOne({
    idempotentKey: `${raw.marketplace}:${raw.listingId}`,
  });
  
  if (listing) {
    return {
      ...raw,
      priceHistory: listing.priceHistory,
      observationCount: listing.observationCount,
      firstSeenAt: listing.firstSeenAt,
      confidence: 0.95, // We have real data
    };
  }
  
  return { ...raw, confidence: 0.5 };
}

async function enrichSeller(raw: RawListing): Promise<SellerData> {
  // Find all listings by this seller
  const sellerListings = await Listing.find({
    marketplace: raw.marketplace,
    sellerName: raw.seller?.name,
  }).limit(50);
  
  if (sellerListings.length > 5) {
    // Calculate trust from real history
    const priceChanges = sellerListings.filter(l => l.priceHistory.length > 1).length;
    const stableSeller = priceChanges / sellerListings.length < 0.3; // Stable = good
    
    return {
      name: raw.seller?.name || 'Unknown',
      trustScore: calculateTrustFromHistory(sellerListings),
      confidence: Math.min(1.0, sellerListings.length / 20),
      historyCount: sellerListings.length,
      // ... rest of seller data
    };
  }
  
  return { name: raw.seller?.name || 'Unknown', trustScore: 50, confidence: 0.3 };
}
```

#### Definition of Done

- ✅ All Tasks 7-11 features can access Listings data
- ✅ Confidence scoring propagates through all features
- ✅ No breaking changes to existing Task 7-11 implementation
- ✅ Data integrity verified (no orphans, correct links)
- ✅ End-to-end flow tested (observation → storage → verdict)
- ✅ Ready for production

---

## Success Metrics

### Data Collection Targets

- [ ] 1,000 listings collected (Week 1)
- [ ] 10,000 listings collected (Week 2)
- [ ] 50,000 listings collected (Week 4)
- [ ] Price history for 80%+ of listings
- [ ] < 1% duplicate rate (unique constraint)

### Quality Metrics

- [ ] All 10 tasks completed on time
- [ ] 250+ tests passing (no regressions)
- [ ] Zero data loss
- [ ] Zero duplicate listings
- [ ] 100% idempotency verified
- [ ] Performance: observation endpoint < 500ms

### Integration Metrics

- [ ] Market Context Gatherer uses real data
- [ ] Confidence scoring based on observation count
- [ ] All Tasks 7-11 features working
- [ ] End-to-end verdict flow verified
- [ ] Ready for production deployment

---

## Risk Mitigation

**Risk: Facebook changes DOM selectors**
- Mitigation: Multiple fallback selectors, regular testing
- Fallback: Graceful degradation (skip extraction if selector fails)

**Risk: Duplicate listings in database**
- Mitigation: Unique constraint on idempotentKey
- Fallback: Application-level dedup on read

**Risk: Performance degradation with many observations**
- Mitigation: Proper indexing (see Task 4)
- Fallback: Archive old observations to separate collection

**Risk: Network failures between extension and backend**
- Mitigation: Batch retry logic in extension
- Fallback: Log to console, skip batch

---

## Timeline

```
Week 1 (Days 1-5): Extension Changes
├─ Mon-Tue: Task 1 (Search detection + extraction)
├─ Wed: Task 2 (Dedup + batching)
└─ Thu-Fri: Task 3 (Testing + integration)

Week 2 (Days 6-10): Backend Changes
├─ Mon: Task 4 (Database schema)
├─ Tue-Wed: Task 5 (Observe endpoint)
└─ Thu-Fri: Task 6 (Testing)

Week 3 (Days 11-15): Integration
├─ Mon-Tue: Task 7 (Wire extension)
└─ Wed-Fri: Task 8 (E2E verification)

Week 4 (Days 16-20): Tasks 7-11 Integration
├─ Mon-Tue: Task 9 (Market Context update)
└─ Wed-Fri: Task 10 (Feature integration + testing)

Result: Full Passive Collection system live
```

---

## Key Documents

- **Architecture:** PHASE_2_PASSIVE_FACEBOOK_COLLECTION.md
- **This Plan:** PHASE_2_PASSIVE_COLLECTION_IMPLEMENTATION_PLAN.md
- **Extension Code Reference:** extension/src/marketplace/
- **Backend Code Reference:** backend/src/routes/marketplace.routes.ts

---

**Status:** Ready to Execute  
**Start Date:** 2026-06-23  
**Expected Completion:** 2026-07-21  

Let's build real marketplace data! 🚀
