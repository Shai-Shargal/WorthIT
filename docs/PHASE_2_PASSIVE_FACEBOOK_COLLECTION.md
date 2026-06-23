# WorthIT: Passive Facebook Marketplace Collection

**Purpose:** Build WorthIT's internal marketplace database by passively collecting real market data while users browse Facebook Marketplace.

**Status:** Architecture Design (Ready for Implementation)  
**Version:** 1.0  
**Date:** 2026-06-23

---

## Executive Summary

**Problem:**
- Current system only collects data when user clicks "Analyze"
- Result: ~5-10 data points per product category
- Limitation: Incomplete market context for AI verdicts

**Solution:**
- Extension detects Facebook Marketplace SEARCH pages
- Passively extracts visible listings while user browses
- Sends observations to backend (no quota usage, no cost)
- Backend builds internal marketplace database over time
- Result: Thousands of listings, real price history, accurate market data

**Impact:**
- Confidence scoring: Now based on real data, not guesses
- Price history: Track prices over time
- Seller intelligence: Real track record from observations
- Market trends: Real demand signals
- Deal detection: Compare to actual market, not Tavily estimates

**Timeline:** 4-6 weeks for full implementation

**Cost:** ~$0 per observation (no API calls, minimal DB storage)

---

## Architecture Overview

```
USER BROWSES FACEBOOK MARKETPLACE
         ↓
    ┌────────────────────────────────────┐
    │   SEARCH PAGE?                     │
    │   (e.g., /marketplace/search/...)  │
    └────────────────────────────────────┘
         ↓ YES
    ┌────────────────────────────────────┐
    │   EXTENSION: Detect & Extract      │
    │   - DOM parse visible listings     │
    │   - Extract: price, title, seller  │
    │   - Check: observedListings Set    │
    │   - Add to Set (dedup)             │
    └────────────────────────────────────┘
         ↓
    ┌────────────────────────────────────┐
    │   BATCH OBSERVATIONS               │
    │   - Accumulate in memory           │
    │   - Every 30 seconds OR 20 items   │
    │   - Send POST /marketplace/observe │
    └────────────────────────────────────┘
         ↓
    ┌────────────────────────────────────┐
    │   BACKEND: Receive & Store         │
    │   - Validate input                 │
    │   - Check: listing exists?         │
    │   - If new: create Listing doc     │
    │   - If exists: update lastSeenAt   │
    │   - Track price history            │
    │   - Increment observationCount     │
    └────────────────────────────────────┘
         ↓
    INTERNAL MARKETPLACE DATABASE GROWS
    (Over time, thousands of listings + history)
         ↓
    USED BY TASKS 7-11
    - Price Intelligence: Compare to real data
    - Market Context: Real averages, not guesses
    - Confidence Scoring: Backed by observation count
    - Trends: Real price history
```

---

## Extension Changes

### 1. Search Page Detection

**Detect when user is on a Facebook Marketplace search page:**

```typescript
function isMarketplaceSearchPage(url: string): boolean {
  // Match patterns:
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

**Extract search query:**

```typescript
function getSearchQuery(url: string): string | null {
  const urlObj = new URL(url);
  return urlObj.searchParams.get('query');
}
```

### 2. DOM Extraction

**Parse visible listings from search results:**

```typescript
interface ObservedListing {
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

function extractListingsFromSearchPage(): ObservedListing[] {
  const listings: ObservedListing[] = [];
  
  // Facebook marketplace search results DOM structure
  // Adjust selectors based on actual HTML
  const listingElements = document.querySelectorAll('[data-testid="marketplace_search_result"]');
  
  listingElements.forEach(element => {
    try {
      const listing = extractSingleListing(element);
      if (listing) {
        listings.push(listing);
      }
    } catch (e) {
      console.warn('[WorthIT] Failed to extract listing:', e);
    }
  });
  
  return listings;
}

function extractSingleListing(element: Element): ObservedListing | null {
  // Fallback selectors (multiple chains)
  const titleEl = element.querySelector('h3') || 
                  element.querySelector('[data-testid="listing_title"]');
  const priceEl = element.querySelector('.mvj9Ob') || 
                  element.querySelector('[data-testid="listing_price"]');
  const linkEl = element.querySelector('a[href*="/marketplace/item/"]');
  
  if (!titleEl || !priceEl || !linkEl) {
    return null;
  }
  
  const listingUrl = linkEl.getAttribute('href');
  const listingId = extractListingId(listingUrl);
  
  if (!listingId) return null;
  
  return {
    marketplace: 'facebook',
    listingId,
    listingUrl,
    title: titleEl.textContent?.trim() || '',
    price: parsePrice(priceEl.textContent),
    currency: 'ILS', // Detect from page locale if possible
    location: extractLocation(element),
    imageUrl: extractImageUrl(element),
    sellerName: extractSellerName(element),
    searchQuery: getSearchQuery(window.location.href),
    observedAt: new Date(),
  };
}

function extractListingId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/marketplace\/item\/(\d+)/);
  return match ? match[1] : null;
}

function parsePrice(text: string | null): number {
  if (!text) return 0;
  // "₪ 1,700" or "$500" or "1700"
  const match = text.match(/[\d,]+/);
  return match ? parseInt(match[0].replace(/,/g, '')) : 0;
}
```

### 3. Client-Side Deduplication

**Prevent sending duplicate observations in same session:**

```typescript
// Global in-memory Set
const observedListings = new Set<string>();

function shouldObserveListingLocally(listingId: string): boolean {
  if (observedListings.has(listingId)) {
    return false; // Already observed this session
  }
  observedListings.add(listingId);
  return true;
}

// On page navigation, clear the set (new search page = new session)
window.addEventListener('beforeunload', () => {
  observedListings.clear();
});
```

### 4. Batch Collection

**Accumulate observations and send in batches:**

```typescript
class MarketplaceObserver {
  private batch: ObservedListing[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  
  private readonly BATCH_SIZE = 20;
  private readonly BATCH_TIMEOUT_MS = 30000; // 30 seconds
  
  addObservations(listings: ObservedListing[]): void {
    // Filter: only add listings not already observed this session
    const newListings = listings.filter(l => 
      shouldObserveListingLocally(l.listingId)
    );
    
    if (newListings.length === 0) return;
    
    this.batch.push(...newListings);
    
    // Send if batch is full
    if (this.batch.length >= this.BATCH_SIZE) {
      this.flushBatch();
    } else if (!this.batchTimer) {
      // Set timer to send eventually
      this.batchTimer = setTimeout(() => this.flushBatch(), this.BATCH_TIMEOUT_MS);
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
      await fetch('https://worthit.local/marketplace/observe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observations: toSend,
          timestamp: new Date(),
        }),
      });
      console.log(`[WorthIT] Sent ${toSend.length} observations`);
    } catch (e) {
      console.error('[WorthIT] Failed to send observations:', e);
      // Optionally retry or re-add to batch
    }
  }
}

const observer = new MarketplaceObserver();

// On search page load + scroll detection
function startObservingSearchPage(): void {
  if (!isMarketplaceSearchPage(window.location.href)) return;
  
  // Initial extraction
  const listings = extractListingsFromSearchPage();
  observer.addObservations(listings);
  
  // On scroll: re-extract (new listings visible)
  let scrollTimeout: NodeJS.Timeout;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const newListings = extractListingsFromSearchPage();
      observer.addObservations(newListings);
    }, 500); // Debounce
  });
}

startObservingSearchPage();
```

### 5. Integration with Existing Code

**Add to content script (alongside existing analyze logic):**

```typescript
// content/script.ts

// Existing analyze functionality
document.addEventListener('click', (e) => {
  if (isAnalyzeButton(e.target)) {
    handleAnalyzeClick(e.target);
  }
});

// NEW: Passive collection on search pages
if (isMarketplaceSearchPage(window.location.href)) {
  startObservingSearchPage();
}

// Detect navigation changes (SPA)
let lastUrl = window.location.href;
setInterval(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    if (isMarketplaceSearchPage(lastUrl)) {
      startObservingSearchPage();
    } else {
      // Stopped being on search page, flush any pending observations
      observer.flushBatch();
    }
  }
}, 500);
```

---

## Backend Changes

### 1. New Endpoint: POST /marketplace/observe

**No authentication required** (observations are anonymous)

```typescript
// POST /marketplace/observe
// No quota usage, no rate limiting (very low cost)

interface ObservationBatch {
  observations: ObservedListing[];
  timestamp: Date;
}

app.post('/marketplace/observe', async (req: Request, res: Response) => {
  try {
    const { observations } = req.body as ObservationBatch;
    
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

async function processObservation(obs: ObservedListing): Promise<{ listingId: string; action: 'created' | 'updated' }> {
  // Idempotent key: marketplace + listingId
  const key = `${obs.marketplace}:${obs.listingId}`;
  
  let listing = await Listing.findOne({ idempotentKey: key });
  
  if (!listing) {
    // NEW LISTING: Create
    listing = new Listing({
      idempotentKey: key,
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
      
      priceHistory: [
        {
          price: obs.price,
          timestamp: new Date(),
        },
      ],
      
      searchQueries: [obs.searchQuery],
    });
    
    await listing.save();
    return { listingId: obs.listingId, action: 'created' };
    
  } else {
    // EXISTING LISTING: Update
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
    return { listingId: obs.listingId, action: 'updated' };
  }
}
```

---

## Database Schema

### Listings Collection

```typescript
interface Listing {
  // Identifiers
  _id: ObjectId;
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
  
  // Price History (enable trend analysis)
  priceHistory: Array<{
    price: number;
    timestamp: Date;
  }>;
  
  // Search Context
  searchQueries: string[]; // ["ps5", "playstation 5", ...]
  
  // Seller Tracking (link to seller intelligence)
  sellerId?: string; // FK to Seller collection (future)
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  
  // Flags
  isActive: boolean; // false if listing deleted
  isSuspect?: boolean; // manual flag if looks like fraud
}
```

**Indexes:**

```typescript
// For deduplication
Listing.collection.createIndex({ idempotentKey: 1 }, { unique: true });

// For queries
Listing.collection.createIndex({ marketplace: 1, listingId: 1 });
Listing.collection.createIndex({ category: 1, searchQueries: 1 });
Listing.collection.createIndex({ lastSeenAt: -1 }); // Recent listings
Listing.collection.createIndex({ 'priceHistory.timestamp': -1 }); // Price history queries
```

---

## Deduplication Strategy

### Client-Side (Extension)

**Goal:** Don't send same listing twice in same browsing session

```typescript
// In-memory Set
observedListings: Set<string> = new Set()

// On extract
if (!observedListings.has(listingId)) {
  observedListings.add(listingId)
  batch.add(listing)
}

// Clear on page unload
window.beforeunload -> observedListings.clear()
```

### Server-Side (Backend)

**Goal:** Multiple clients observing same listing should update one record

**Unique Key Strategy:**

```
marketplace + listingId (PREFERRED)
Example: "facebook:1367953568531456"

Fallback:
marketplace + normalizedUrl
Example: "facebook:https://facebook.com/marketplace/item/1367953568531456"
```

**Idempotent Updates:**

```typescript
// Don't create duplicates
const existing = await Listing.findOne({ idempotentKey });

// Same listing observed twice
if (existing) {
  // Update lastSeenAt, don't duplicate
  // Track price history
  // Increment observationCount
}
```

---

## Price History

**Why track price history?**
- Detect price drops (good deal)
- Detect price increases (seller testing market)
- Identify price stability (fair market)
- Enable trend analysis (market average over time)

**Storage:**

```typescript
priceHistory: [
  { price: 1700, timestamp: "2026-06-23T10:00:00Z" },
  { price: 1650, timestamp: "2026-06-24T14:30:00Z" },
  { price: 1600, timestamp: "2026-06-25T09:15:00Z" },
]
```

**Queries:**

```typescript
// Average price for a category this month
const avgPrice = await Listing.aggregate([
  { $match: { category: 'PS5', 'priceHistory.timestamp': { $gte: monthStart } } },
  { $unwind: '$priceHistory' },
  { $group: { _id: null, avgPrice: { $avg: '$priceHistory.price' } } }
]);

// Price trend for a listing
const trend = await Listing.findById(id).select('priceHistory');

// Price range for category
const range = await Listing.aggregate([
  { $match: { category: 'PS5' } },
  { $group: {
      _id: null,
      min: { $min: '$currentPrice' },
      max: { $max: '$currentPrice' },
      avg: { $avg: '$currentPrice' },
      median: { $avg: '$currentPrice' } // simplified
    }
  }
]);
```

---

## Integration with Tasks 7-11

**Task 7-11 Usage:**

Instead of relying on Tavily/estimates, use real collected data:

```typescript
// BEFORE (without passive collection):
const marketContext = await gatherMarketContext(rawListing);
// → Make Tavily call, get estimate, low confidence

// AFTER (with passive collection):
const marketContext = await gatherMarketContext(rawListing);

async function gatherMarketContext(raw: RawListing): Promise<MarketData> {
  // Query our internal database first
  const similarListings = await Listing.find({
    category: raw.category,
    currency: raw.currency,
    lastSeenAt: { $gte: 7daysAgo },
  });
  
  if (similarListings.length > 50) {
    // We have real data! Use it.
    const prices = similarListings.map(l => l.currentPrice);
    return {
      priceContext: {
        average: mean(prices),
        median: median(prices),
        min: Math.min(...prices),
        max: Math.max(...prices),
        count: similarListings.length,
        confidence: Math.min(1.0, similarListings.length / 100), // More samples = higher confidence
      },
      demand: assessDemandFromObservationCount(similarListings),
      trend: calculateTrendFromPriceHistory(similarListings),
    };
  } else {
    // Fallback to Tavily if we don't have enough data
    return await tavilyMarketSearch(raw);
  }
}
```

---

## Implementation Plan

### Phase 1: Extension Changes (1 week)

- [ ] Task 1: Search page detection + DOM extraction
  - Detect Facebook marketplace search pages
  - Extract visible listings (title, price, seller, URL)
  - Unit tests with mock HTML

- [ ] Task 2: Client-side deduplication + batching
  - Implement observedListings Set
  - Accumulate observations in memory
  - Send batches (20 items or 30 seconds)
  - Error handling + retries

- [ ] Task 3: Extension testing
  - Manual test on real Facebook marketplace search
  - Verify observations are extracted
  - Verify batches are sent to backend

### Phase 2: Backend Changes (1 week)

- [ ] Task 4: Database schema
  - Create Listings collection
  - Add indexes (idempotentKey, marketplace, category)
  - Schema migration if needed

- [ ] Task 5: POST /marketplace/observe endpoint
  - Receive observation batches
  - Validate observations
  - Idempotent upsert (create or update)
  - Track price history
  - Return results

- [ ] Task 6: Backend testing
  - Unit tests for endpoint
  - Integration tests with DB
  - Test deduplication
  - Test price history tracking

### Phase 3: Integration (1 week)

- [ ] Task 7: Wire extension to backend
  - Update extension to send to correct endpoint
  - Add error handling
  - Add logging

- [ ] Task 8: Verify end-to-end
  - Test full flow (search → extract → send → store)
  - Monitor database growth
  - Check for duplicates

### Phase 4: Task 7-11 Integration (1 week)

- [ ] Task 9: Update Market Context Gatherer
  - Query internal Listings collection first
  - Fallback to Tavily if needed
  - Confidence scoring based on sample size

- [ ] Task 10: Enable other features
  - Seller intelligence uses real history
  - Trends use price history
  - Competitive analysis uses cross-listing data

---

## Data Quality & Safety

### What we collect:
- ✅ Public listing data (visible to anyone)
- ✅ No user data
- ✅ No authentication required
- ✅ No personal information

### What we don't collect:
- ❌ User browsing history
- ❌ User account info
- ❌ Messages or chats
- ❌ Private seller info

### Privacy:
- Data is aggregated (no user ID)
- No tracking of individual users
- No linking observations to specific people
- Compliant with Facebook ToS (just extracting public data)

---

## Cost Analysis

**Per Observation:**
- Extension: ~0 bytes (local dedup)
- Network: ~1 KB per observation
- Database: ~1 KB storage + index
- Processing: <5ms DB operation
- **Total cost:** ~$0.000001 per observation

**Scale:**
- 1,000 observations/day: $0.001/day
- 1,000,000 observations/day: $1/day
- At scale: Very low operational cost

**Comparison:**
- Tavily API: $0.05-$0.10 per search
- Passive collection: $0.000001 per observation
- **Savings:** 50,000x cheaper

---

## Success Metrics

### Data Collection
- [ ] 1,000 listings collected in first week
- [ ] 10,000+ listings within first month
- [ ] Price history captured for 80%+ of listings
- [ ] < 1% duplicate rate

### Database Quality
- [ ] All listings have title, price, URL
- [ ] Price history for 50%+ of listings
- [ ] Average observation count > 5 per listing
- [ ] Idempotency verified (no duplicates)

### Integration Quality
- [ ] Market Context Gatherer uses real data when available
- [ ] Confidence scoring reflects sample size
- [ ] Fallback to Tavily works smoothly
- [ ] Zero production errors

---

## Future Enhancements

### Phase 2+: Additional Features

1. **Yad2 Passive Collection**
   - Same approach for Yad2 search pages
   - Different DOM selectors
   - Builds Yad2 marketplace database

2. **Seller Tracking**
   - Link observations to seller
   - Track seller's listing patterns
   - Enable seller intelligence (real track record)

3. **Price Alerts**
   - User can watch listing prices
   - Get notified on price drops
   - "This PS5 dropped 10% in 3 days"

4. **Deal Detection**
   - Compare price to market average
   - Highlight deals ("This is 20% below market")
   - Explain market context

5. **Analytics Dashboard**
   - Real-time market trends
   - Category heatmaps
   - Price history charts
   - Seller rankings

---

## Notes

**Why this matters:**
- AI verdicts based on REAL data, not guesses
- Confidence scoring backed by sample size
- Price history enables trend detection
- Seller intelligence from real track record
- Network effect: more users = better data

**Key principle:**
- Never invent data
- Always explain source
- Show confidence levels
- Users trust accurate data

---

**Owner:** Backend + Extension  
**Status:** Design Complete - Ready to Implement  
**Last Updated:** 2026-06-23
