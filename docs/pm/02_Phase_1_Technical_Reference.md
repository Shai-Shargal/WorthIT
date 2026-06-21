# Phase 1 Technical Reference & Data

**Created:** June 21, 2026  
**Purpose:** Backend engineer reference for Phase 1 implementation

---

## Current System State (v0.1)

### Implemented Features

| Feature | Status | Quality | Notes |
|---------|--------|---------|-------|
| Core analysis pipeline | ✅ Working | Good | Deterministic verdict + AI explanation |
| Tavily API integration | ✅ Working | Good | Web search for prices, ILS-only |
| Chrome extension | ✅ Working | Fragile | DOM extraction for Facebook only |
| MongoDB persistence | ✅ Working | Poor | Schema uses Mixed types, no User model |
| Google OAuth stub | ✅ Working | Bad | Accepts any token, no validation |
| Condition analysis | ✅ Working | Good | AI-powered condition scoring |
| In-memory caching | ✅ Working | Good | 200 entry condition cache, 500 entry analysis cache |
| Test coverage | ✅ 96 tests | Good | Decent unit test isolation, mocked services |

---

### Database Schema (Current)

```typescript
// Analysis.ts
{
  _id: ObjectId
  analysisId: string
  listing: Schema.Types.Mixed  // ProductInput (unvalidated)
  verdict: 'worth_it' | 'maybe' | 'avoid'
  reasoning: Schema.Types.Mixed  // AI output (unvalidated)
  localMarketContext: Schema.Types.Mixed  // Market stats (unvalidated)
  historicalContext: Schema.Types.Mixed  // Historical data (unvalidated)
  createdAt: Date
}

// MarketObservation.ts
{
  _id: ObjectId
  productName: string
  observedPrice: number
  currency: string
  source: string
  description: string
  condition: string
  location: string
  timestamp: Date  // 1-year TTL index
}
```

**Problems:**
- No User collection
- No userId in Analysis
- No Product master table
- Schema.Types.Mixed = no validation
- No versioning/history
- No analysis linking to products

---

### API Endpoints (Current)

```
POST /analyze
  Body: { title, price, currency, description?, url?, image? }
  Response: { analysisId, listing, verdict, reasoning, localMarketContext, historicalContext }
  Auth: None (stub)
  Rate limit: None

GET /analysis/:id
  Response: Analysis document from MongoDB
  Auth: None
  Rate limit: None

POST /marketplace/observe
  Body: { observations: [{ productName, observedPrice, currency, ... }] }
  Auth: None
  Rate limit: None

POST /auth/google
  Body: { googleToken, email?, picture? }
  Response: { token: JWT, userId }
  Auth: None (accepts any token)

GET /user/usage
  Response: { analysesUsed, limit, remaining }
  Auth: None

GET /health
  Response: { status }
```

**Problems:**
- No auth enforcement
- No rate limiting
- No userId validation
- Usage endpoint returns in-memory data (lost on restart)

---

### Extension Structure (Current)

```
extension/
├── manifest.json
├── popup.html
├── popup.js              // UI for "Analyze" button
├── background.js         // Empty (no background monitoring)
├── content.js            // Loads extractor
├── utils/
│   ├── extractor.ts      // Facebook DOM parser (fragile)
│   ├── api.ts            // Backend communication
│   └── storage.ts        // Chrome local storage (unused)
└── styles/
    └── popup.css
```

**Problems:**
- DOM selectors hardcoded for Facebook
- No fallback selectors
- No extraction error logging
- Background.js empty (no monitoring)

---

## Phase 1 Database Schema (Required Changes)

### New: User Collection

```typescript
User {
  _id: ObjectId
  email: string (unique, indexed)
  googleId: string (unique)
  googlePicture?: string
  googleName?: string
  createdAt: Date (indexed)
  tier: 'free' | 'pro' | 'enterprise' (default: 'free')
  trialExpiresAt?: Date (indexed)
  analysesUsedThisMonth: number (default: 0)
  monthStartDate: Date
  lastAnalysisAt?: Date
  preferences: {
    notifications: boolean
    saveHistory: boolean
  }
}

Indexes:
- email (unique)
- googleId (unique)
- trialExpiresAt (for cleanup)
```

---

### New: Product Collection

```typescript
Product {
  _id: ObjectId
  canonicalUrl: string (unique, indexed)
  marketplace: 'facebook' | 'yad2' | 'ebay' | 'amazon'
  title: string
  category?: string
  specs?: {
    brand?: string
    model?: string
    year?: number
    condition?: 'like_new' | 'good' | 'fair' | 'poor'
    storage?: string
    ram?: string
    color?: string
    [key: string]: any
  }
  createdAt: Date
  updatedAt: Date
  analysisCount: number
  lastAnalyzedAt: Date
  
  analysisHistory: [{
    analysisId: string
    verdict: 'worth_it' | 'maybe' | 'avoid'
    reasoning: object
    redFlags: RedFlag[]
    localMarketContext: object
    historicalContext: object
    userId: ObjectId
    timestamp: Date
  }]
  
  marketObservations: [{
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

---

### Refactored: Analysis Collection

```typescript
Analysis {
  _id: ObjectId
  analysisId: string (indexed)
  userId: ObjectId (indexed, required)
  productId: ObjectId (indexed, required)
  
  listing: ProductInput {
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
  
  redFlags: RedFlag[] {
    category: 'seller' | 'price' | 'condition' | 'photo' | 'description'
    severity: 'caution' | 'warning' | 'high_risk'
    description: string
  }
  
  sellerInfo: {
    name?: string
    rating?: number
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
      priceHistory: [{ price, timestamp }]
      trend: 'increasing' | 'stable' | 'decreasing'
    }
  }
  
  createdAt: Date (indexed)
  updatedAt: Date
}

Indexes:
- analysisId
- userId
- productId
- createdAt
```

---

### New: UsageLog Collection

```typescript
UsageLog {
  _id: ObjectId
  userId: ObjectId (indexed)
  yearMonth: string (format: "2026-06", indexed)
  analysesUsed: number
  createdAt: Date
}

Indexes:
- userId + yearMonth (compound)
```

---

### New: UserFeedback Collection

```typescript
UserFeedback {
  _id: ObjectId
  userId: ObjectId (indexed)
  analysisId: ObjectId (indexed)
  helpful: boolean
  accuracy?: number (1-5 scale)
  notes?: string
  createdAt: Date
}

Indexes:
- userId
- analysisId
```

---

### Updated: MarketObservation Collection

```typescript
MarketObservation {
  _id: ObjectId
  productId: ObjectId (indexed)
  
  productName: string (indexed)
  title?: string
  
  observedPrice: number
  currency: string
  
  marketplace: 'facebook' | 'yad2' | 'ebay' | 'amazon' | 'tavily'
  source: string
  
  specs?: {
    condition?: string
    color?: string
    [key: string]: any
  }
  
  location?: string
  url?: string
  
  timestamp: Date (indexed)
  expiresAt: Date (TTL: 1 year)
}

Indexes:
- productId
- productName
- currency + timestamp + condition (compound)
- timestamp (for TTL)
```

---

## Phase 1 API Changes Required

### 1. POST /auth/google

**Current:** Accepts any token, generates random userId

**New:**
```typescript
POST /auth/google
Body: {
  googleToken: string  // JWT from Google Sign-In
}

Process:
1. Validate googleToken against Google public keys (googleapis library)
2. Extract email, picture, name from token
3. Find or create User in DB
4. Generate new JWT (internal, not Google's)
5. Return { token, user: { email, picture, name, tier, analysesRemaining } }

Errors:
- 400 Bad Request — invalid token
- 401 Unauthorized — token validation failed

Response:
{
  token: string (JWT, expires 7 days)
  user: {
    email: string
    picture?: string
    name?: string
    tier: 'free' | 'pro' | 'enterprise'
    analysesRemaining: number
  }
}
```

---

### 2. POST /auth/logout

**New endpoint:**
```typescript
POST /auth/logout
Headers: { Authorization: "Bearer {token}" }

Process:
1. Validate JWT
2. Add token to blacklist (Redis cache, 7-day TTL)
3. Return { success: true }

Note: In MVP, blacklist is optional. Can implement in Phase 2.
```

---

### 3. POST /analyze

**Current:** No auth, global usage tracking

**New:**
```typescript
POST /analyze
Headers: { Authorization: "Bearer {token}" }
Body: {
  title: string
  price: number
  currency: string
  description?: string
  url?: string
  image?: string
}

Process:
1. Validate JWT, extract userId
2. Check user.tier and monthly usage quota
3. Check if product already in DB (by canonicalUrl)
4. Fetch market data (Tavily + local DB)
5. Run analysis (AI verdict + reasoning)
6. Store in Analysis + Product.analysisHistory
7. Increment UsageLog.analysesUsed
8. Return verdict + reasoning

Errors:
- 401 Unauthorized — invalid token
- 402 Payment Required — quota exceeded
- 400 Bad Request — invalid input
- 429 Too Many Requests — rate limited (20/min per IP)

Response:
{
  analysisId: string
  verdict: 'worth_it' | 'maybe' | 'avoid'
  verdictReason: string
  reasoning: { summary, positives, concerns }
  redFlags: RedFlag[]
  sellerInfo: { name, rating, redFlags }
  marketData: { localMarketContext, historicalContext }
  estimatedValue?: { min, max, currency }
}
```

---

### 4. GET /analysis/:id

**Current:** Returns Analysis, no auth

**New:**
```typescript
GET /analysis/:id
Headers: { Authorization: "Bearer {token}" }

Process:
1. Validate JWT, extract userId
2. Fetch Analysis by id
3. Check userId matches (user can only view own analyses)
4. Return full analysis with all context

Errors:
- 401 Unauthorized — invalid token
- 403 Forbidden — user doesn't own this analysis
- 404 Not Found — analysis doesn't exist
```

---

### 5. GET /user/me

**New endpoint:**
```typescript
GET /user/me
Headers: { Authorization: "Bearer {token}" }

Response:
{
  email: string
  picture?: string
  name?: string
  tier: string
  createdAt: Date
  trialExpiresAt?: Date
  analysesUsedThisMonth: number
  analysesRemaining: number
  monthStartDate: Date
}
```

---

### 6. GET /user/analyses

**New endpoint:**
```typescript
GET /user/analyses?limit=20&offset=0&marketplace=facebook
Headers: { Authorization: "Bearer {token}" }

Response:
[
  {
    analysisId: string
    productTitle: string
    marketplace: string
    verdict: string
    price: number
    createdAt: Date
  }
]
```

---

### 7. POST /user/feedback

**New endpoint:**
```typescript
POST /user/feedback
Headers: { Authorization: "Bearer {token}" }
Body: {
  analysisId: string
  helpful: boolean
  accuracy?: number
  notes?: string
}

Process:
1. Validate JWT
2. Save UserFeedback to DB
3. Return { success: true }

Purpose: Collect data on verdict accuracy for model improvement.
```

---

## Phase 1 Marketplace Integration Requirements

### Facebook Marketplace

**Current:** DOM extraction only

**Required for Phase 1:**
1. Improve DOM selectors (add fallbacks)
2. Seller rating integration (TBD: Graph API or DOM extraction?)
3. Error logging for failed extractions
4. Rate limiting to avoid detection

**DOM Selectors to Preserve/Improve:**
```javascript
// Current selectors (subject to change with FB redesign)
const fbSelectors = {
  title: 'h1, [data-testid="listing-title"]',
  price: '[data-testid="price"], [aria-label*="₪"]',
  description: '[data-testid="listing-description"]',
  image: 'img[src*="marketplace"]',
  currency: '[aria-label*="₪"], [aria-label*="NIS"]',
}

// Fallbacks to add
const fallbacks = {
  title: 'h2, [role="heading"]',
  price: '[class*="price"], [class*="Price"]',
  description: '[class*="desc"], [role="article"]',
  image: 'img[alt*="listing"], img[src*="cdn"]',
}
```

**Seller Rating Integration (TBD):**
- Option A: Use Facebook Graph API (requires app registration)
- Option B: Extract seller URL, scrape seller profile (fragile)
- Option C: Use third-party service (paid)

---

### Yad2 Marketplace

**Not yet integrated**

**Required for Phase 1:**
1. Determine if Yad2 has public API or DOM extraction only
2. Build DOM extractor (similar to Facebook)
3. Normalize data to ProductInput schema
4. Test with real Yad2 listings

**Yad2 DOM Extraction Skeleton:**
```typescript
// extension/utils/yad2Extractor.ts
export function extractYad2Listing(doc: Document): ProductInput | null {
  const title = doc.querySelector('[data-test*="title"]')?.textContent;
  const price = parseInt(doc.querySelector('[data-test*="price"]')?.textContent);
  const currency = 'ILS'; // Yad2 is Israel-only
  const description = doc.querySelector('[data-test*="description"]')?.textContent;
  const image = doc.querySelector('img[src*="yad2"]')?.src;
  const url = window.location.href;
  
  return { title, price, currency, description, url, image };
}
```

---

### Provider Architecture (Placeholder for Phase 1)

**Current state:** Tavily-only, hardcoded in priceGathering.ts

**Phase 1 minimum:** Loop through Tavily only (no architectural change yet)

**Phase 3:** Refactor to pluggable providers:
```typescript
interface MarketDataProvider {
  id: string
  fetchObservations(query: PriceQuery): Promise<MarketObservation[]>
  name: string
}

class ProviderRegistry {
  providers: MarketDataProvider[]
  
  async aggregateObservations(query: PriceQuery): Promise<MarketObservation[]> {
    const results = await Promise.all(
      this.providers.map(p => p.fetchObservations(query))
    );
    return results.flat();
  }
}
```

---

## Phase 1 Fraud Detection Requirements

### Price Sanity Checks

```typescript
const categoryBounds = {
  'electronics': { min: 50, max: 100000, currency: 'ILS' },
  'phones': { min: 100, max: 80000, currency: 'ILS' },
  'computers': { min: 500, max: 50000, currency: 'ILS' },
  'gaming': { min: 200, max: 100000, currency: 'ILS' },
  'vehicles': { min: 5000, max: 500000, currency: 'ILS' },
  'furniture': { min: 50, max: 50000, currency: 'ILS' },
  'default': { min: 20, max: 200000, currency: 'ILS' },
};

// In analyze function:
if (price < bounds.min || price > bounds.max) {
  redFlags.push({
    category: 'price',
    severity: 'warning',
    description: `Price ${price} is outside typical range for ${category}: ₪${bounds.min}-${bounds.max}`
  });
}
```

---

### Stock Photo Detection

**Phase 1 Implementation:** Manual detection rules

```typescript
const stockPhotoIndicators = [
  // Google Images watermarks
  /google\./i,
  /images\.google\./i,
  
  // Manufacturer product photos (pristine condition)
  /manufacturer|official|stock|promotional/i,
  
  // URLs to common stock photo sites
  /unsplash|pexels|pixabay|shutterstock|getty/i,
];

// In extension, before sending to backend:
if (image && stockPhotoIndicators.some(regex => regex.test(image))) {
  redFlags.push({
    category: 'photo',
    severity: 'high_risk',
    description: 'Image appears to be stock/promotional photo, not actual listing photo'
  });
}
```

**Phase 2/3:** Add reverse image search (Google Images API, TinEye).

---

### Facebook Seller Rating Integration

**TBD: How to fetch?**

Option A (Graph API):
```
GET https://graph.facebook.com/{seller_id}?fields=rating,review_count
```

Option B (DOM extraction):
```javascript
const sellerRating = document.querySelector('[aria-label*="rating"]')?.textContent;
const ratingCount = document.querySelector('[aria-label*="review"]')?.textContent;
```

**Data structure:**
```typescript
sellerInfo: {
  name: string
  rating: number (0-5)
  ratingCount: number
  responseTime?: string (e.g., "Usually responds within 1 hour")
  redFlags?: [
    'New seller (< 1 month)',
    'Low rating (< 3 stars)',
    'Multiple scam complaints',
  ]
}
```

---

## Phase 1 Logging & Monitoring

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
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());

// In error handling
catch (error) {
  Sentry.captureException(error, {
    tags: { endpoint: '/analyze', userId },
    extra: { listing, verdict },
  });
}
```

### Key Events to Log

- User login (success/failure)
- Analysis start/complete (with verdict)
- API errors (with context)
- Quota exceeded
- Extraction failures (FB/Yad2)
- Tavily API errors
- Database errors

---

## Phase 1 Rate Limiting

### express-rate-limit Configuration

```typescript
// backend/src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';

const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute per IP
  message: 'Too many analyses. Please try again later.',
  standardHeaders: true, // Return RateLimit-* headers
  legacyHeaders: false,
  skip: (req) => {
    // Allow unlimited for testing (optional)
    return req.header('X-Skip-Rate-Limit') === process.env.RATE_LIMIT_BYPASS_KEY;
  },
});

app.post('/analyze', analyzeLimiter, analyzeHandler);
```

---

## Phase 1 Integration Tests

### Test Structure

```
backend/src/__tests__/
├── integration/
│   ├── auth.integration.test.ts
│   ├── analyze.integration.test.ts
│   ├── user.integration.test.ts
│   └── marketplace.integration.test.ts
├── e2e/
│   ├── full-flow.e2e.test.ts (end-to-end pipeline)
│   └── extension-integration.e2e.test.ts (extension + API)
└── fixtures/
    ├── mongodb.fixture.ts (test DB setup)
    ├── sample-listings.fixture.ts (FB/Yad2 samples)
    └── users.fixture.ts (test users)
```

---

### Sample E2E Test

```typescript
describe('E2E: Full Analysis Flow', () => {
  let db;
  let testUser;
  let testListing;
  
  beforeAll(async () => {
    db = await startTestMongoDB();
    testUser = await createTestUser(db, 'test@example.com');
  });
  
  afterAll(async () => {
    await stopTestMongoDB();
  });
  
  test('User signs in, analyzes Facebook listing, gets verdict', async () => {
    // 1. POST /auth/google → get JWT
    const authRes = await request(app)
      .post('/auth/google')
      .send({ googleToken: mockGoogleToken });
    
    const token = authRes.body.token;
    expect(authRes.status).toBe(200);
    
    // 2. POST /analyze → analyze listing
    const analyzeRes = await request(app)
      .post('/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'iPhone 13 64GB',
        price: 2500,
        currency: 'ILS',
        url: 'facebook.com/marketplace/item/123',
        description: 'Like new, original box, no scratches'
      });
    
    expect(analyzeRes.status).toBe(200);
    expect(analyzeRes.body.verdict).toBeDefined();
    expect(['worth_it', 'maybe', 'avoid']).toContain(analyzeRes.body.verdict);
    
    // 3. GET /user/me → verify usage was tracked
    const userRes = await request(app)
      .get('/user/me')
      .set('Authorization', `Bearer ${token}`);
    
    expect(userRes.body.analysesUsedThisMonth).toBe(1);
  });
});
```

---

## Success Criteria for Phase 1 Complete

### Code Quality
- [ ] 96+ tests passing (unit + integration)
- [ ] All critical bugs fixed
- [ ] Code reviewed and approved
- [ ] Test coverage > 80% for new code

### Feature Completeness
- [ ] Google OAuth working (real validation)
- [ ] User model in DB, analyses linked to userId
- [ ] Trial key system functioning (1-week expiry)
- [ ] Usage quota enforced per-user
- [ ] Facebook + Yad2 support (both extractors working)
- [ ] Fraud detection (price sanity + stock photo warning)
- [ ] Seller ratings displayed
- [ ] All errors logged to Sentry

### Manual Testing
- [ ] E2E flow: Login → Analyze FB listing → See verdict
- [ ] E2E flow: Login → Analyze Yad2 listing → See verdict
- [ ] Quota enforcement: After 10 analyses, 11th is blocked (free tier)
- [ ] Error handling: Check Sentry has no critical unhandled errors
- [ ] Rate limiting: Spam /analyze, verify 429 responses

### Deployment Ready
- [ ] All env vars documented
- [ ] Database migrations tested
- [ ] Sentry configured
- [ ] Rate limiting configured
- [ ] CORS configured for production
- [ ] Logging working

---

## Appendix: Current Test Results

**From recent audit (2026-06-21):**
- Total tests: 96
- Passing: 96 ✅
- Failing: 0
- Skipped: 0
- Coverage: ~75% (estimated)

**Test files:**
1. app.test.ts — Server startup, routes
2. auth.test.ts — JWT generation/validation
3. tavily.test.ts — Tavily API integration
4. condition.test.ts — Condition analysis
5. repository.test.ts — MongoDB queries
6. usageTracker.test.ts — Usage tracking
7. statistics.test.ts — Price statistics
8. specsExtractor.test.ts — Specs parsing
9. aiAnalysis.test.ts — AI verdict generation
10. priceGathering.test.ts — Market data aggregation

---

**Document Version:** 1.0  
**Last Updated:** June 21, 2026  
**Phase 1 Start Date:** TBD (after founder approval)  
**Phase 1 Target End Date:** Week 5 (5 weeks from start)
