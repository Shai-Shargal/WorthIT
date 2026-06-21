# Backend Engineer Prompt: Phase 1 MVP Implementation

**Project:** WorthIT  
**Phase:** Phase 1 (MVP for Reseller Recruitment)  
**Timeline:** Weeks 1-5  
**Status:** Ready to execute  
**PM:** Claude

---

## Mission

Build production-ready backend for WorthIT Phase 1 MVP. Replace auth stub with real Google OAuth, refactor database schema to support user tracking and multi-marketplace analysis, add fraud detection, and implement monitoring.

**Success = Week 5:** MVP ready for 10-20 resellers to test with 1-week trial keys.

---

## Phase 1 Scope (What You're Building)

### ✅ Authentication & Users
- Real Google OAuth (validate JWT against Google public keys)
- User model in MongoDB (email, trial status, subscription tier)
- Per-user analysis tracking
- Trial key system (1-week free unlimited analyses)
- Session management (JWT 7-day expiry, logout endpoint)

### ✅ Database Refactor
- New User collection
- New Product collection (canonical listing deduplication)
- Refactored Analysis collection (link to userId, productId)
- New UsageLog collection (track quota per user per month)
- New UserFeedback collection (for accuracy tracking)
- Proper Mongoose schemas (no more Schema.Types.Mixed)

### ✅ API Endpoints (7 total)
- POST /auth/google — Real OAuth
- POST /auth/logout — Logout & token blacklist
- POST /analyze — Analyze listing (with auth + quota check)
- GET /analysis/:id — Retrieve saved analysis (user-scoped)
- GET /user/me — User profile + usage stats
- GET /user/analyses — List user's past analyses
- POST /user/feedback — Collect verdict feedback

### ✅ Multi-Marketplace Aggregation
- Improve Facebook Marketplace DOM extractor (add fallback selectors)
- **[TBD]** Yad2 integration (decision: API vs DOM extraction — pending founder)
- Tavily integration (already working, no changes needed)
- Market data aggregation (loop through providers, combine results)

### ✅ Fraud Detection
- Price sanity checks (flag unrealistic prices by category)
- Stock photo detection (warn if image appears to be stock/promotional)
- **[TBD]** Facebook seller ratings integration (decision: Graph API vs DOM extraction — pending founder)
- Basic red flag warnings (new seller, 0 ratings, suspicious language)

### ✅ Infrastructure
- Sentry integration (error tracking & monitoring)
- Rate limiting (20 req/min per IP on /analyze)
- CORS security hardened
- Database indexes optimized
- Integration tests (real MongoDB, E2E flows)

### ❌ Out of Scope (Phase 2+)
- Product folders / watchlists
- Background monitoring / price drop alerts
- eBay / Amazon integration
- Subscription billing
- Image caching
- Advanced ML-based fraud detection

---

## Database Schema Specifications

### 1. User Collection

```typescript
interface User {
  _id: ObjectId
  email: string                    // unique, indexed
  googleId: string                 // unique
  googlePicture?: string
  googleName?: string
  createdAt: Date                  // indexed
  tier: 'free' | 'pro' | 'enterprise'  // default: 'free'
  trialExpiresAt?: Date            // indexed (for cleanup)
  analysesUsedThisMonth: number    // incremented per analysis
  monthStartDate: Date             // reset monthly
  lastAnalysisAt?: Date
  preferences: {
    notifications: boolean         // default: true
    saveHistory: boolean           // default: true
  }
}

Indexes:
- email (unique)
- googleId (unique)
- trialExpiresAt (ascending, for TTL cleanup)
- createdAt (ascending, for analytics)
```

**Validation:**
- email: must be valid email format
- googleId: required, non-empty
- tier: only accept listed values
- analysesUsedThisMonth: >= 0
- trialExpiresAt: if present, must be in future (on creation)

---

### 2. Product Collection

```typescript
interface Product {
  _id: ObjectId
  canonicalUrl: string             // unique, indexed (e.g., "facebook.com/marketplace/item/123")
  marketplace: 'facebook' | 'yad2' | 'ebay' | 'amazon'
  title: string
  category?: string                // e.g., 'Electronics', 'Vehicles', 'Furniture'
  specs?: {
    brand?: string
    model?: string
    year?: number
    condition?: 'like_new' | 'good' | 'fair' | 'poor'
    storage?: string               // e.g., "256GB"
    ram?: string                   // e.g., "8GB"
    color?: string
    [key: string]: any             // flexible for different product types
  }
  createdAt: Date
  updatedAt: Date
  analysisCount: number            // total analyses for this product
  lastAnalyzedAt: Date
  
  analysisHistory: [{
    analysisId: string
    verdict: 'worth_it' | 'maybe' | 'avoid'
    verdictReason: 'overpriced' | 'fair' | 'underpriced' | 'insufficient_data'
    reasoning: {
      summary: string
      positives: string[]
      concerns: string[]
    }
    redFlags: [{
      category: 'seller' | 'price' | 'condition' | 'photo' | 'description'
      severity: 'caution' | 'warning' | 'high_risk'
      description: string
    }]
    localMarketContext: {
      p25: number
      p50: number
      p75: number
      mean: number
      count: number
      source: 'db' | 'tavily' | 'web'
      dataQuality: 'real' | 'limited' | 'insufficient'
    }
    historicalContext?: {
      priceHistory: [{ price: number, timestamp: Date }]
      trend: 'increasing' | 'stable' | 'decreasing'
    }
    userId: ObjectId
    timestamp: Date
  }]
  
  marketObservations?: [{
    observedPrice: number
    currency: string
    source: string
    timestamp: Date
  }]
}

Indexes:
- canonicalUrl (unique)
- marketplace
- createdAt
- lastAnalyzedAt
```

**Validation:**
- canonicalUrl: unique, non-empty
- marketplace: only listed values
- analysisCount: >= 0
- analysisHistory: each must have userId, verdict, timestamp
- specs: flexible schema, no strict validation

---

### 3. Analysis Collection (Refactored)

```typescript
interface Analysis {
  _id: ObjectId
  analysisId: string               // indexed, unique
  userId: ObjectId                 // indexed, required — CRITICAL: enforce in all queries
  productId: ObjectId              // indexed, required
  
  listing: {
    title: string
    price: number
    currency: string
    description?: string
    url?: string
    image?: string
  }
  
  verdict: 'worth_it' | 'maybe' | 'avoid'
  verdictReason: 'overpriced' | 'fair' | 'underpriced' | 'insufficient_data'
  
  reasoning: {
    summary: string
    positives: string[]
    concerns: string[]
  }
  
  redFlags: [{
    category: 'seller' | 'price' | 'condition' | 'photo' | 'description'
    severity: 'caution' | 'warning' | 'high_risk'
    description: string
  }]
  
  sellerInfo?: {
    name?: string
    rating?: number                // 0-5
    ratingCount?: number
    responseTime?: string
    redFlags?: string[]
  }
  
  marketData: {
    localMarketContext: {
      p25: number
      p50: number
      p75: number
      mean: number
      count: number
      source: 'db' | 'tavily' | 'web'
      dataQuality: 'real' | 'limited' | 'insufficient'
    }
    historicalContext?: {
      priceHistory: [{ price: number, timestamp: Date }]
      trend: 'increasing' | 'stable' | 'decreasing'
    }
  }
  
  createdAt: Date                  // indexed
  updatedAt: Date
}

Indexes:
- analysisId (unique)
- userId (ascending, for "my analyses" queries)
- productId (ascending, for product history)
- createdAt (descending, for chronological ordering)
- [userId, createdAt] (compound, for "my analyses sorted by date")
```

**Validation:**
- analysisId: unique, non-empty
- userId: required, must exist in User collection
- productId: required, must exist in Product collection
- verdict: only listed values
- price: > 0
- redFlags: each must have category, severity, description

---

### 4. UsageLog Collection

```typescript
interface UsageLog {
  _id: ObjectId
  userId: ObjectId                 // indexed
  yearMonth: string                // format: "2026-06", indexed
  analysesUsed: number
  createdAt: Date
}

Indexes:
- userId + yearMonth (compound, unique)
```

**Validation:**
- userId: required, must exist in User collection
- yearMonth: format YYYY-MM
- analysesUsed: >= 0

---

### 5. UserFeedback Collection

```typescript
interface UserFeedback {
  _id: ObjectId
  userId: ObjectId                 // indexed
  analysisId: ObjectId             // indexed
  helpful: boolean
  accuracy?: number                // 1-5 scale
  notes?: string
  createdAt: Date
}

Indexes:
- userId
- analysisId
```

**Validation:**
- userId: required, must exist
- analysisId: required, must exist
- helpful: boolean
- accuracy: if present, must be 1-5

---

## API Endpoint Specifications

### 1. POST /auth/google

**Purpose:** Authenticate user with Google OAuth token

**Request:**
```json
{
  "googleToken": "string (JWT from Google Sign-In)"
}
```

**Process:**
1. Validate googleToken against Google's public keys (use `google-auth-library`)
2. Extract email, picture, name from token
3. Find User by googleId. If not found, create new User with:
   - email, googleId, googlePicture, googleName
   - tier: 'free'
   - trialExpiresAt: now + 7 days
   - analysesUsedThisMonth: 0
4. Generate new JWT (internal, not Google's):
   ```
   { userId, email, tier, exp: now + 7 days }
   ```
5. Return token + user profile

**Response (200 OK):**
```json
{
  "token": "string (JWT, expires in 7 days)",
  "user": {
    "email": "user@example.com",
    "picture": "https://...",
    "name": "User Name",
    "tier": "free",
    "analysesRemaining": 15
  }
}
```

**Errors:**
- 400 Bad Request: missing googleToken
- 401 Unauthorized: invalid/expired googleToken
- 500 Server Error: database error

**Security:**
- Validate token signature against Google's public keys
- HTTPS only
- Never log googleToken
- Store only googleId, not full token

---

### 2. POST /auth/logout

**Purpose:** Invalidate user's current session

**Request:**
```
Headers: { Authorization: "Bearer {token}" }
```

**Process:**
1. Validate JWT (extract userId)
2. Add token to Redis blacklist (7-day TTL)
3. Return success

**Response (200 OK):**
```json
{
  "success": true
}
```

**Errors:**
- 401 Unauthorized: invalid/missing token

**Note:** For MVP, Redis blacklist is optional. Can implement in Phase 2. For now, accept that users could re-use old tokens until expiry.

---

### 3. POST /analyze

**Purpose:** Analyze a listing and return verdict + fraud detection

**Request:**
```
Headers: { Authorization: "Bearer {token}" }
Content-Type: application/json

{
  "title": "iPhone 13 64GB",
  "price": 2500,
  "currency": "ILS",
  "description": "Like new, original box, no scratches",
  "url": "https://facebook.com/marketplace/item/123456",
  "image": "https://platform-lookaside.fbsbx.com/..."
}
```

**Required Fields:** title, price, currency  
**Optional Fields:** description, url, image

**Process:**

1. **Validate JWT** → extract userId
2. **Check quota:**
   - Find UsageLog for userId + current yearMonth
   - If analysesUsed >= 15 (free tier limit), return 402 Payment Required
3. **Check if product already analyzed:**
   - Find Product by canonicalUrl
   - If found, add to analysisHistory (version)
   - If not found, create new Product
4. **Price sanity check:**
   ```
   categoryBounds = {
     'electronics': { min: 50, max: 100000 },
     'phones': { min: 100, max: 80000 },
     'vehicles': { min: 5000, max: 500000 },
     'furniture': { min: 50, max: 50000 },
     'default': { min: 20, max: 200000 }
   }
   
   If price < min or > max:
     - Add redFlag: { category: 'price', severity: 'warning', description: '...' }
   ```
5. **Stock photo detection (basic):**
   ```
   stockPhotoIndicators = [
     /google\./i, /images\.google\./i,
     /manufacturer|official|stock|promotional/i,
     /unsplash|pexels|pixabay|shutterstock|getty/i
   ]
   
   If image URL matches any indicator:
     - Add redFlag: { category: 'photo', severity: 'high_risk', description: '...' }
   ```
6. **Fetch market data:**
   - Call gatherPrices() (existing function, uses Tavily + DB)
   - Filter results to remove obvious outliers
   - Compute p25, p50, p75, mean
7. **Compute verdict (deterministic logic):**
   ```
   if marketData.count < 3:
     - verdict = 'maybe'
     - verdictReason = 'insufficient_data'
   else:
     - if listing.price < p25:
       verdict = 'worth_it', verdictReason = 'underpriced'
     - else if listing.price > p75:
       verdict = 'avoid', verdictReason = 'overpriced'
     - else:
       verdict = 'maybe', verdictReason = 'fair'
   ```
8. **Generate reasoning (AI):**
   - Call aiAnalysis.generateReasoning() with context
   - Get { summary, positives, concerns }
9. **Fetch seller info:**
   - **[TBD]** Extract or fetch Facebook seller rating
   - Look for seller name in listing URL or metadata
   - If available: { name, rating, ratingCount, responseTime }
   - If rating < 2.0: add redFlag: { category: 'seller', severity: 'high_risk', description: 'Low-rated seller' }
10. **Store analysis:**
    - Create Analysis document with userId + productId + all verdict data
    - Update Product.analysisHistory with verdict
    - Increment UsageLog.analysesUsed
    - Increment Product.analysisCount
11. **Return verdict**

**Response (200 OK):**
```json
{
  "analysisId": "uuid",
  "verdict": "worth_it | maybe | avoid",
  "verdictReason": "overpriced | fair | underpriced | insufficient_data",
  "reasoning": {
    "summary": "This iPhone is priced fair compared to market...",
    "positives": ["Like new condition", "Original box included"],
    "concerns": ["High asking price for older model"]
  },
  "redFlags": [
    {
      "category": "photo",
      "severity": "caution",
      "description": "Image appears to be stock photo..."
    }
  ],
  "sellerInfo": {
    "name": "Seller Name",
    "rating": 4.5,
    "ratingCount": 23,
    "responseTime": "Usually within 1 hour"
  },
  "marketData": {
    "localMarketContext": {
      "p25": 2200,
      "p50": 2500,
      "p75": 3000,
      "mean": 2550,
      "count": 45,
      "source": "db | tavily",
      "dataQuality": "real | limited | insufficient"
    },
    "historicalContext": {
      "priceHistory": [
        { "price": 2400, "timestamp": "2026-06-15" },
        { "price": 2500, "timestamp": "2026-06-18" }
      ],
      "trend": "stable"
    }
  },
  "estimatedValue": {
    "min": 2200,
    "max": 3000,
    "currency": "ILS"
  }
}
```

**Errors:**
- 400 Bad Request: missing required fields, invalid price
- 401 Unauthorized: invalid token
- 402 Payment Required: quota exceeded
- 429 Too Many Requests: rate limited
- 500 Server Error: Tavily error, AI error, DB error

**Rate Limiting:** 20 requests per minute per IP

**Quota Rules:**
- Free tier: 15 analyses/month
- Pro tier: 100/month (Phase 3)
- Enterprise: unlimited (Phase 3)

---

### 4. GET /analysis/:id

**Purpose:** Retrieve a saved analysis by ID

**Request:**
```
Headers: { Authorization: "Bearer {token}" }
GET /analysis/abc123
```

**Process:**
1. Validate JWT → extract userId
2. Find Analysis by analysisId
3. **Security check:** Verify analysis.userId === userId (user can only view own)
4. Return full analysis

**Response (200 OK):**
```json
{
  "analysisId": "...",
  "productTitle": "iPhone 13 64GB",
  "verdict": "worth_it",
  "reasoning": { ... },
  "redFlags": [ ... ],
  "marketData": { ... },
  "createdAt": "2026-06-21T10:30:00Z"
}
```

**Errors:**
- 401 Unauthorized: invalid token
- 403 Forbidden: user doesn't own this analysis
- 404 Not Found: analysis doesn't exist

---

### 5. GET /user/me

**Purpose:** Get current user's profile + usage stats

**Request:**
```
Headers: { Authorization: "Bearer {token}" }
```

**Process:**
1. Validate JWT → extract userId
2. Fetch User document
3. Fetch UsageLog for current yearMonth
4. Calculate analysesRemaining = tier_limit - analyses_used
5. Return profile

**Response (200 OK):**
```json
{
  "email": "user@example.com",
  "picture": "https://...",
  "name": "User Name",
  "tier": "free",
  "createdAt": "2026-06-01T12:00:00Z",
  "trialExpiresAt": "2026-06-29T12:00:00Z",
  "analysesUsedThisMonth": 3,
  "analysesRemaining": 12,
  "monthStartDate": "2026-06-01T00:00:00Z"
}
```

**Errors:**
- 401 Unauthorized: invalid token

---

### 6. GET /user/analyses

**Purpose:** List user's past analyses (paginated)

**Request:**
```
Headers: { Authorization: "Bearer {token}" }
GET /user/analyses?limit=20&offset=0&marketplace=facebook
```

**Query Parameters:**
- limit: number (default: 20, max: 100)
- offset: number (default: 0)
- marketplace: string (optional, filter: 'facebook' | 'yad2')

**Process:**
1. Validate JWT → extract userId
2. Query Analysis collection:
   ```
   db.Analysis.find({ userId, ...(marketplace ? { marketplace } : {}) })
     .sort({ createdAt: -1 })
     .limit(limit)
     .skip(offset)
   ```
3. Return list with pagination metadata

**Response (200 OK):**
```json
{
  "analyses": [
    {
      "analysisId": "...",
      "productTitle": "iPhone 13 64GB",
      "marketplace": "facebook",
      "verdict": "worth_it",
      "price": 2500,
      "currency": "ILS",
      "createdAt": "2026-06-21T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 47,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

**Errors:**
- 401 Unauthorized: invalid token
- 400 Bad Request: invalid limit/offset

---

### 7. POST /user/feedback

**Purpose:** Collect user feedback on verdict accuracy

**Request:**
```
Headers: { Authorization: "Bearer {token}" }
Content-Type: application/json

{
  "analysisId": "abc123",
  "helpful": true,
  "accuracy": 4,
  "notes": "This verdict was spot on, I bought and got a great deal"
}
```

**Required Fields:** analysisId, helpful  
**Optional Fields:** accuracy, notes

**Process:**
1. Validate JWT → extract userId
2. Verify analysisId exists + belongs to userId
3. Create UserFeedback document
4. Return success

**Response (200 OK):**
```json
{
  "success": true
}
```

**Errors:**
- 400 Bad Request: missing required fields
- 401 Unauthorized: invalid token
- 404 Not Found: analysis doesn't exist

---

## Multi-Marketplace Integration

### Facebook Marketplace (Existing)

**Current Status:** Working but fragile  
**Action:** Improve DOM selectors, add fallbacks

**Improvements:**
```typescript
// extension/utils/extractor.ts

const fbSelectors = {
  title: [
    'h1', 
    '[data-testid="listing-title"]',
    '[role="heading"]',
    'h2'
  ],
  price: [
    '[data-testid="price"]',
    '[aria-label*="₪"]',
    '[class*="price"]',
    '[class*="Price"]'
  ],
  description: [
    '[data-testid="listing-description"]',
    '[class*="desc"]',
    '[role="article"]'
  ],
  image: [
    'img[src*="marketplace"]',
    'img[src*="cdn"]',
    'img[alt*="listing"]'
  ],
  currency: [
    '[aria-label*="₪"]',
    '[aria-label*="NIS"]'
  ]
};

function extractWithFallbacks(doc, selectors) {
  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    if (element?.textContent?.trim()) {
      return element.textContent.trim();
    }
  }
  return null;
}
```

**DOM Extraction Error Logging:**
- Log failed extractions to Sentry with listing URL
- Include which selectors failed
- Use for monitoring FB UI changes

---

### Yad2 Marketplace

**Status:** [TBD]  
**Decision Pending:** API vs DOM extraction

**Option A: DOM Extraction (simpler, faster)**
```typescript
// extension/utils/yad2Extractor.ts
export function extractYad2Listing(doc: Document): ProductInput | null {
  const title = doc.querySelector('[data-test*="title"]')?.textContent?.trim();
  const price = parseInt(doc.querySelector('[data-test*="price"]')?.textContent?.replace(/[^\d]/g, ''));
  const currency = 'ILS'; // Yad2 is Israel-only
  const description = doc.querySelector('[data-test*="description"]')?.textContent?.trim();
  const image = doc.querySelector('img[src*="yad2"]')?.src;
  const url = window.location.href;
  
  if (!title || !price) return null;
  
  return { title, price, currency, description, url, image };
}
```

**Option B: Yad2 API (cleaner, but requires API key)**
```
GET https://api.yad2.co.il/listing/{id}
Authorization: Bearer {api_key}

Response: { title, price, description, images, seller, ... }
```

**Action:** Founder will decide A or B, backend engineer implements.

---

## Fraud Detection Implementation

### 1. Price Sanity Checks

```typescript
// backend/src/services/fraudDetection.ts

const categoryBounds = {
  'electronics': { min: 50, max: 100000 },
  'phones': { min: 100, max: 80000 },
  'computers': { min: 500, max: 50000 },
  'gaming': { min: 200, max: 100000 },
  'vehicles': { min: 5000, max: 500000 },
  'furniture': { min: 50, max: 50000 },
  'jewelry': { min: 100, max: 500000 },
  'sports': { min: 50, max: 20000 },
  'default': { min: 20, max: 200000 }
};

export function detectPriceSanity(title: string, price: number, category?: string): RedFlag | null {
  const bounds = categoryBounds[category] || categoryBounds.default;
  
  if (price < bounds.min || price > bounds.max) {
    return {
      category: 'price',
      severity: 'warning',
      description: `Price ₪${price} is outside typical range for ${category}: ₪${bounds.min}-${bounds.max}`
    };
  }
  
  return null;
}
```

---

### 2. Stock Photo Detection

```typescript
// backend/src/services/fraudDetection.ts

const stockPhotoIndicators = [
  /google\./i,
  /images\.google\./i,
  /google images/i,
  /manufacturer|official|stock|promotional/i,
  /unsplash|pexels|pixabay|shutterstock|getty|istockphoto/i,
  /amazon\.com/i,           // Amazon product photos
  /alibaba|aliexpress/i,
];

export function detectStockPhoto(imageUrl?: string, title?: string): RedFlag | null {
  if (!imageUrl && !title) return null;
  
  const textToCheck = `${imageUrl || ''} ${title || ''}`;
  
  if (stockPhotoIndicators.some(regex => regex.test(textToCheck))) {
    return {
      category: 'photo',
      severity: 'high_risk',
      description: 'Image appears to be stock/promotional photo. Verify with seller.'
    };
  }
  
  return null;
}
```

---

### 3. Seller Reputation Flags

```typescript
// backend/src/services/fraudDetection.ts

export function detectSellerRedFlags(sellerInfo?: {
  rating?: number,
  ratingCount?: number,
  name?: string,
  responseTime?: string
}): RedFlag[] {
  const flags: RedFlag[] = [];
  
  if (!sellerInfo) return flags;
  
  if (sellerInfo.rating === undefined || sellerInfo.rating === 0) {
    flags.push({
      category: 'seller',
      severity: 'caution',
      description: 'Seller has no rating or is new. Proceed with caution.'
    });
  } else if (sellerInfo.rating < 2.0) {
    flags.push({
      category: 'seller',
      severity: 'high_risk',
      description: `Seller has low rating (${sellerInfo.rating}/5). Consider other sellers.`
    });
  }
  
  if (sellerInfo.ratingCount !== undefined && sellerInfo.ratingCount === 1) {
    flags.push({
      category: 'seller',
      severity: 'caution',
      description: 'Seller is very new (only 1 review). High risk of scam.'
    });
  }
  
  return flags;
}
```

---

### 4. Description Red Flags

```typescript
// backend/src/services/fraudDetection.ts

const suspiciousKeywords = [
  /urgent|must sell|asap|hurry|limited time/i,
  /too good to be true|unbelievable price/i,
  /no returns|final sale|as is/i,
  /untested|not working|broken/i,
  /missing parts|incomplete|damaged/i,
  /cashier check|wire transfer|western union/i,  // unusual payment methods
  /meet in person|no shipping/i,
];

export function detectDescriptionRedFlags(description?: string): RedFlag[] {
  if (!description) return [];
  
  const flags: RedFlag[] = [];
  
  suspiciousKeywords.forEach(regex => {
    if (regex.test(description)) {
      flags.push({
        category: 'description',
        severity: 'caution',
        description: `Suspicious keyword detected: "${regex.source}"`
      });
    }
  });
  
  return flags;
}
```

---

## Infrastructure Requirements

### Sentry Integration

```typescript
// backend/src/config/sentry.ts
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
  ],
});

// In app.ts
import app from './app';
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

**Key Events to Log:**
- Auth failures (401 errors)
- Analysis failures (errors in verdict generation, Tavily failures)
- Quota exceeded (402 errors)
- Extraction failures (FB/Yad2 DOM parsing)
- API errors (external service timeouts)
- Database errors
- Rate limit hits

**Error Context:**
```typescript
Sentry.captureException(error, {
  tags: {
    endpoint: '/analyze',
    userId: userId || 'anonymous',
    marketplace: 'facebook' || 'yad2'
  },
  extra: {
    listingTitle: title,
    listingPrice: price,
    verdict: verdict,
    marketDataPoints: count
  }
});
```

---

### Rate Limiting

```typescript
// backend/src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';

const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // max 20 requests per minute per IP
  message: 'Too many analyses. Please try again later.',
  standardHeaders: true, // Return RateLimit-* headers
  legacyHeaders: false,
  skip: (req) => {
    // Optional: bypass for testing
    return req.header('X-Bypass-Rate-Limit') === process.env.RATE_LIMIT_BYPASS_KEY;
  },
});

app.post('/analyze', analyzeLimiter, analyzeHandler);
```

---

### Environment Variables Required

```
# Google OAuth
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# MongoDB
MONGO_URI=mongodb://localhost:27017/worthit
MONGO_TEST_URI=mongodb://localhost:27017/worthit-test

# Tavily API
TAVILY_API_KEY=xxx

# OpenAI
OPENAI_API_KEY=xxx

# Sentry
SENTRY_DSN=https://xxx@sentry.io/xxx

# JWT
JWT_SECRET=xxx (min 32 chars)

# Environment
NODE_ENV=development|production
PORT=3000

# CORS
CORS_ORIGIN=http://localhost:3000,https://example.com (comma-separated)

# Rate Limiting
RATE_LIMIT_BYPASS_KEY=xxx (optional, for testing)

# [TBD] Facebook API
FACEBOOK_APP_ID=xxx (if using Graph API for seller ratings)
FACEBOOK_APP_SECRET=xxx

# [TBD] Yad2 API
YAD2_API_KEY=xxx (if using Yad2 API instead of DOM extraction)
```

---

## Integration Testing

### Test Structure

```
backend/src/__tests__/
├── integration/
│   ├── auth.integration.test.ts
│   ├── analyze.integration.test.ts
│   ├── user.integration.test.ts
│   └── marketplace.integration.test.ts
├── e2e/
│   ├── full-flow.e2e.test.ts
│   └── quota-enforcement.e2e.test.ts
└── fixtures/
    ├── mongodb.fixture.ts
    ├── sample-listings.fixture.ts
    └── google-oauth.fixture.ts
```

### Example E2E Test

```typescript
// backend/src/__tests__/e2e/full-flow.e2e.test.ts

describe('E2E: Full Analysis Flow', () => {
  let mongoConnection;
  let app;
  
  beforeAll(async () => {
    mongoConnection = await startTestMongoDB();
    app = require('../../app');
  });
  
  afterAll(async () => {
    await mongoConnection.close();
  });
  
  test('User signs in, analyzes listing, gets verdict with quota enforcement', async () => {
    // 1. POST /auth/google
    const authRes = await request(app)
      .post('/auth/google')
      .send({
        googleToken: mockGoogleJWT({ email: 'test@example.com', sub: 'google-id-123' })
      });
    
    expect(authRes.status).toBe(200);
    expect(authRes.body.token).toBeDefined();
    const token = authRes.body.token;
    
    // 2. POST /analyze (should succeed)
    const analyzeRes = await request(app)
      .post('/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'iPhone 13 64GB',
        price: 2500,
        currency: 'ILS',
        description: 'Like new, original box'
      });
    
    expect(analyzeRes.status).toBe(200);
    expect(analyzeRes.body.verdict).toBeDefined();
    expect(['worth_it', 'maybe', 'avoid']).toContain(analyzeRes.body.verdict);
    
    // 3. GET /user/me (verify quota incremented)
    const meRes = await request(app)
      .get('/user/me')
      .set('Authorization', `Bearer ${token}`);
    
    expect(meRes.status).toBe(200);
    expect(meRes.body.analysesUsedThisMonth).toBe(1);
    expect(meRes.body.analysesRemaining).toBe(14);
    
    // 4. GET /user/analyses (verify analysis saved)
    const listRes = await request(app)
      .get('/user/analyses')
      .set('Authorization', `Bearer ${token}`);
    
    expect(listRes.status).toBe(200);
    expect(listRes.body.analyses.length).toBe(1);
    expect(listRes.body.analyses[0].verdict).toBe(analyzeRes.body.verdict);
  });
  
  test('Quota enforcement: Free tier limit is 15/month', async () => {
    const token = /* create user with 15 analyses already */;
    
    // 16th analysis should fail
    const res = await request(app)
      .post('/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Test',
        price: 1000,
        currency: 'ILS'
      });
    
    expect(res.status).toBe(402); // Payment Required
    expect(res.body.message).toContain('quota');
  });
});
```

---

## Success Criteria (Phase 1 Complete)

### Code Quality
- [ ] 96+ tests passing (unit + integration)
- [ ] All critical bugs fixed (0 P1 issues in Sentry)
- [ ] Code reviewed and approved
- [ ] Test coverage > 80% for new code

### Feature Completeness
- [ ] Google OAuth working with real JWT validation
- [ ] User model in MongoDB, can sign in
- [ ] Analyses linked to userId, can retrieve user's history
- [ ] Trial key system working (1-week expiry)
- [ ] Usage quota enforced (free tier 15/month)
- [ ] Facebook Marketplace support (improved selectors)
- [ ] **[TBD]** Yad2 support (pending API decision)
- [ ] Fraud detection (price sanity + stock photo warning)
- [ ] **[TBD]** Seller ratings (pending integration method decision)
- [ ] All errors logged to Sentry
- [ ] Rate limiting protecting /analyze endpoint

### Manual Testing Checklist
- [ ] E2E: Login → Analyze FB listing → See verdict + market data
- [ ] E2E: Login → Analyze Yad2 listing → See verdict + market data
- [ ] Quota: Create user, analyze 15 times, 16th fails with 402
- [ ] Fraud: Analyze overpriced item, see red flag
- [ ] Fraud: Analyze stock photo, see warning
- [ ] Auth: Old token rejected after logout
- [ ] Rate limit: Spam endpoint, receive 429 after 20 requests/min
- [ ] Error logging: Cause error, verify in Sentry with context

### Deployment Ready
- [ ] All env vars documented in .env.example
- [ ] Database migrations tested (old → new schema)
- [ ] Sentry configured and receiving errors
- [ ] Rate limiting configured for production
- [ ] CORS configured (not open to all)
- [ ] Logging in place (no silent failures)
- [ ] Database indexes created (performance)
- [ ] Seed data fixture ready (for testing resellers)

---

## TBD Items (Pending Founder Decisions)

1. **Yad2 Integration**
   - [ ] Founder provides: API vs DOM extraction method
   - [ ] Backend: Implement chosen approach
   - [ ] Extension: Add DOM extractor or API client

2. **Facebook Seller Ratings**
   - [ ] Founder provides: Graph API vs DOM extraction method
   - [ ] Backend: Implement chosen approach
   - [ ] Extension: Extract/fetch seller info and pass to backend

---

## Implementation Priority

**Weeks 1-2: Foundation**
1. User model + Google OAuth implementation
2. Database schema refactoring + migrations
3. Auth middleware + JWT validation
4. Trial key system + usage quota tracking

**Weeks 2-3: Multi-Marketplace**
5. Improve Facebook DOM extractor (fallback selectors)
6. **[TBD]** Implement Yad2 integration (pending decision)
7. Tavily integration testing (already working)
8. Market data aggregation layer

**Week 4: Fraud Detection + Monitoring**
9. Price sanity checks
10. Stock photo detection
11. **[TBD]** Seller ratings integration (pending decision)
12. Sentry integration
13. Rate limiting middleware
14. Error handling & logging

**Week 4-5: Testing + Polish**
15. Integration test suite (real MongoDB, E2E flows)
16. Manual QA (all features tested)
17. Bug fixes
18. Code review + refactoring

**By Week 5:** MVP ready for reseller recruitment

---

## Questions for PM Before Starting

1. **Yad2:** API or DOM extraction? Any specific Yad2 API documentation?
2. **Facebook Seller Ratings:** Graph API or DOM extraction? Do you have a test account?
3. **Database:** Is MongoDB running locally? Need help setting up?
4. **Sentry:** Do you have a Sentry account/DSN ready?
5. **Timeline:** Any hard deadline for Week 5 MVP, or flexible?

---

## Acceptance Criteria Summary

✅ Backend MVP is complete when:
1. All endpoints implemented and tested
2. Google OAuth validates real JWT tokens
3. User model tracks analyses per-user
4. Quota enforcement prevents overuse
5. Fraud detection flags suspicious listings
6. All errors logged to Sentry
7. Rate limiting active on /analyze
8. Integration tests passing (96+)
9. Zero critical bugs
10. Ready for reseller recruitment

---

**Document Version:** 1.0  
**Created:** June 21, 2026  
**Ready to Execute:** Yes  
**Estimated Duration:** 5 weeks  
**Team Size:** 1 backend engineer + support

Ready to start? Let me know if you have questions or need clarification on any spec.
