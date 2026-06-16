# WorthIT UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four UX problems: wrong product title extraction, no way to pick which listing to analyze, jargon-heavy verdict text, and misleading confidence score on synthetic data.

**Architecture:** Backend tasks (1–3) add a `dataQuality` field to `LocalMarketContext`, cap confidence scores accordingly, and rewrite the AI prompt and fallback narrative to plain language. Extension tasks (4–6) fix the title extractor, add a click-to-select selection mode, and show a data quality warning banner in the overlay. The extension has no unit test framework — extension tasks are verified by `npm run build` + manual reload in Chrome.

**Tech Stack:** TypeScript 5, Express 4, Vitest (backend tests only), Chrome MV3, Vite (extension build).

## Global Constraints

- All imports use `.js` extension (Node ESM resolution).
- Extension source is in `extension/src/`; build output goes to `extension/dist/` via `cd extension && npm run build`.
- Backend tests: `cd backend && npm test`. Typecheck: `cd backend && npm run typecheck`.
- MongoDB is optional — all code must work without `MONGO_URI`.
- Verdict is always deterministic — the LLM only narrates.
- No new npm packages may be installed.
- `dataQuality: 'real' | 'seed' | 'insufficient'` — these exact string literals must be used everywhere.

---

### Task 1: Add `dataQuality` to shared type and set it in `marketContext.ts`

**Files:**
- Modify: `shared/types/market.ts` — add `dataQuality` field to `LocalMarketContext`
- Modify: `backend/src/marketplace/marketContext.ts` — compute and pass `dataQuality`
- Test: `backend/tests/marketContext.test.ts` — extend existing tests

**Interfaces:**
- Produces: `LocalMarketContext.dataQuality: 'real' | 'seed' | 'insufficient'` — consumed by Tasks 2, 3, 6

- [ ] **Step 1: Write the failing test**

Add to the end of `backend/tests/marketContext.test.ts`:

```typescript
describe('buildMarketContexts — dataQuality', () => {
  it('sets dataQuality to seed when falling back to seed data', async () => {
    findMock.mockResolvedValue([]);
    seedMock.mockResolvedValue([obs({ source: 'static-seed' })]);
    const { localMarketContext } = await buildMarketContexts({ name: 'iPhone 13', currency: 'ILS' });
    expect(localMarketContext.dataQuality).toBe('seed');
  });

  it('sets dataQuality to insufficient when fewer than 5 real observations', async () => {
    findMock.mockImplementation(async (q) => {
      if (q.sinceDays) return [obs(), obs(), obs()]; // 3 real
      return [];
    });
    const { localMarketContext } = await buildMarketContexts({ name: 'iPhone 13', currency: 'ILS' });
    expect(localMarketContext.dataQuality).toBe('insufficient');
  });

  it('sets dataQuality to real when 5 or more real observations', async () => {
    findMock.mockImplementation(async (q) => {
      if (q.sinceDays) return [obs(), obs(), obs(), obs(), obs()]; // 5 real
      return [];
    });
    const { localMarketContext } = await buildMarketContexts({ name: 'iPhone 13', currency: 'ILS' });
    expect(localMarketContext.dataQuality).toBe('real');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/marketContext.test.ts
```

Expected: FAIL — `Property 'dataQuality' does not exist on type 'LocalMarketContext'`

- [ ] **Step 3: Add `dataQuality` to the shared type**

Edit `shared/types/market.ts` — add `dataQuality` to `LocalMarketContext`:

```typescript
export interface LocalMarketContext {
  query: string;
  currency: string;
  observationCount: number;
  dataQuality: 'real' | 'seed' | 'insufficient';
  priceRange?: PriceRange;
  typicalPrice?: TypicalPriceBand;
  recentObservations: MarketObservation[];
  notes: string[];
}
```

- [ ] **Step 4: Set `dataQuality` in `marketContext.ts`**

Replace `buildLocalContext` signature and `buildMarketContexts` in `backend/src/marketplace/marketContext.ts` with:

```typescript
function buildLocalContext(
  query: MarketContextQuery,
  observations: MarketObservation[],
  notes: string[],
  dataQuality: 'real' | 'seed' | 'insufficient',
): LocalMarketContext {
  const prices = observations
    .map((obs) => obs.observedPrice)
    .filter((p) => Number.isFinite(p) && p > 0);

  const cleaned = removeOutliers(prices);
  const usable = cleaned.length > 0 ? cleaned : prices;
  const distribution = describePrices(usable);

  if (observations.length < LOW_OBSERVATION_THRESHOLD) {
    notes.push(
      `Only ${observations.length} recent Israeli-market observation${observations.length === 1 ? '' : 's'} found; confidence is limited.`,
    );
  }

  return {
    query: query.name,
    currency: query.currency,
    observationCount: observations.length,
    dataQuality,
    priceRange: distribution
      ? { min: round(distribution.min), max: round(distribution.max) }
      : undefined,
    typicalPrice: distribution
      ? {
          p25: round(distribution.p25),
          p50: round(distribution.p50),
          p75: round(distribution.p75),
        }
      : undefined,
    recentObservations: observations.slice(0, RECENT_OBSERVATION_LIMIT),
    notes,
  };
}
```

And in `buildMarketContexts`, track whether seed was used and compute `dataQuality`:

```typescript
export async function buildMarketContexts(query: MarketContextQuery): Promise<MarketContexts> {
  const currency = query.currency.trim().toUpperCase() || 'USD';
  const normalized: MarketContextQuery = { name: query.name, currency };
  const notes: string[] = [];

  const [recentStored, olderStored] = await Promise.all([
    findSimilarObservations({
      name: normalized.name,
      currency,
      sinceDays: RECENT_WINDOW_DAYS,
      limit: RECENT_OBSERVATION_LIMIT,
    }),
    findSimilarObservations({
      name: normalized.name,
      currency,
      olderThanDays: RECENT_WINDOW_DAYS,
      limit: HISTORICAL_OBSERVATION_LIMIT,
    }),
  ]);

  let recent = recentStored;
  let usedSeed = false;

  if (recent.length === 0) {
    const seed = await getSeedObservations({ name: normalized.name, currency }).catch((err) => {
      console.error('[marketContext] seed provider failed:', err instanceof Error ? err.message : err);
      return [] as MarketObservation[];
    });
    if (seed.length > 0) {
      recent = seed;
      usedSeed = true;
      notes.push(
        'No live Israeli-market observations stored yet; falling back to synthetic seed data.',
      );
    }
  }

  const dataQuality: 'real' | 'seed' | 'insufficient' =
    usedSeed ? 'seed' :
    recentStored.length < 5 ? 'insufficient' :
    'real';

  const localMarketContext = buildLocalContext(normalized, recent, notes, dataQuality);
  const historicalContext = buildHistoricalContext(normalized, olderStored);

  return { localMarketContext, historicalContext };
}
```

- [ ] **Step 5: Fix TypeScript errors from the new required field**

The `LocalMarketContext` objects in test helper functions need `dataQuality`. Update every `context()` or `LocalMarketContext` literal in test files to include `dataQuality: 'real'`:

In `backend/tests/verdict.test.ts`, update the `context()` helper:
```typescript
function context(overrides: Partial<LocalMarketContext> = {}): LocalMarketContext {
  return {
    query: 'iPhone 13',
    currency: 'ILS',
    observationCount: 5,
    dataQuality: 'real',
    priceRange: { min: 1800, max: 2400 },
    typicalPrice: { p25: 1900, p50: 2050, p75: 2200 },
    recentObservations: [],
    notes: [],
    ...overrides,
  };
}
```

In `backend/tests/narrative.test.ts`, update the `LocalMarketContext` object:
```typescript
localMarketContext: {
  query: 'iPhone 13',
  currency: 'ILS',
  observationCount: 5,
  dataQuality: 'real',
  typicalPrice: { p25: 1900, p50: 2050, p75: 2200 },
  recentObservations: [],
  notes: [],
} as LocalMarketContext,
```

In `backend/tests/analysisRepository.test.ts`, update the `makeResponse()` helper:
```typescript
localMarketContext: {
  query: 'iPhone 13',
  currency: 'ILS',
  observationCount: 0,
  dataQuality: 'insufficient',
  recentObservations: [],
  notes: [],
},
```

- [ ] **Step 6: Run all tests and typecheck**

```bash
cd /Users/shaishargal/worthIT/backend && npm run typecheck && npm test
```

Expected: All tests pass, no type errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/shaishargal/worthIT
git add shared/types/market.ts backend/src/marketplace/marketContext.ts backend/tests/marketContext.test.ts backend/tests/verdict.test.ts backend/tests/narrative.test.ts backend/tests/analysisRepository.test.ts
git commit -m "feat: add dataQuality field to LocalMarketContext (real/seed/insufficient)"
```

---

### Task 2: Cap confidence score based on `dataQuality`

**Files:**
- Modify: `backend/src/analysis/verdict.ts`
- Test: `backend/tests/verdict.test.ts`

**Interfaces:**
- Consumes: `LocalMarketContext.dataQuality: 'real' | 'seed' | 'insufficient'` from Task 1
- Produces: `VerdictResult.confidence` capped at 0.30 for seed, 0.50 for insufficient, 0.85 for real

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/verdict.test.ts`:

```typescript
describe('confidence caps by dataQuality', () => {
  it('caps confidence at 0.30 when dataQuality is seed', () => {
    const result = computeVerdict({
      listing: listing(1500),
      localMarketContext: context({ dataQuality: 'seed', observationCount: 15 }),
    });
    expect(result.confidence).toBeLessThanOrEqual(0.30);
    expect(result.confidenceLevel).toBe('low');
  });

  it('caps confidence at 0.50 when dataQuality is insufficient', () => {
    const result = computeVerdict({
      listing: listing(1500),
      localMarketContext: context({ dataQuality: 'insufficient', observationCount: 3 }),
    });
    expect(result.confidence).toBeLessThanOrEqual(0.50);
  });

  it('allows up to 0.85 when dataQuality is real', () => {
    const result = computeVerdict({
      listing: listing(1500),
      localMarketContext: context({ dataQuality: 'real', observationCount: 20 }),
    });
    expect(result.confidence).toBeLessThanOrEqual(0.85);
    expect(result.confidence).toBeGreaterThan(0.50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/verdict.test.ts
```

Expected: FAIL — confidence for seed data exceeds 0.30.

- [ ] **Step 3: Apply the cap in `verdict.ts`**

Replace the full `computeVerdict` function in `backend/src/analysis/verdict.ts`:

```typescript
export function computeVerdict(input: VerdictInput): VerdictResult {
  const { listing, localMarketContext } = input;
  const typical = localMarketContext.typicalPrice;
  const observationCount = localMarketContext.observationCount;

  let verdict: Verdict = 'maybe';
  let confidence = Math.min(0.4, 0.05 + observationCount * 0.05);

  if (typical && observationCount > 0) {
    const ratio = listing.price / typical.p50;
    verdict =
      ratio <= 0.8 ? 'worth_it' : ratio >= 1.2 ? 'avoid' : 'maybe';
    confidence = Math.min(
      0.85,
      0.25 + observationCount * 0.08 + (verdict === 'maybe' ? 0 : 0.1),
    );
  }

  const qualityCap =
    localMarketContext.dataQuality === 'seed' ? 0.30 :
    localMarketContext.dataQuality === 'insufficient' ? 0.50 :
    0.85;

  confidence = Math.min(confidence, qualityCap);

  const worthRating =
    typical && observationCount > 0
      ? worthRatingFromRatio(listing.price / typical.p50)
      : 3;

  return {
    verdict,
    worthRating,
    confidence,
    confidenceLevel: confidenceLevel(confidence),
    estimatedValue:
      localMarketContext.priceRange && observationCount >= 3
        ? {
            min: localMarketContext.priceRange.min,
            max: localMarketContext.priceRange.max,
            currency: localMarketContext.currency,
          }
        : undefined,
  };
}
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/shaishargal/worthIT/backend && npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/shaishargal/worthIT
git add backend/src/analysis/verdict.ts backend/tests/verdict.test.ts
git commit -m "feat: cap confidence at 30%/50%/85% based on dataQuality"
```

---

### Task 3: Rewrite AI narrative to plain friend-advice language

**Files:**
- Modify: `backend/src/ai/narrative.ts` — new system prompt, plain fallback, dataQuality in user prompt

**Interfaces:**
- Consumes: `NarrativeInput.localMarketContext.dataQuality` (added in Task 1)
- Produces: `AiReasoning` with plain human-readable text

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/narrative.test.ts`:

```typescript
describe('fallback narrative — plain language', () => {
  it('does not contain jargon words in worth_it fallback', async () => {
    const result = await generateNarrative({
      listing: {
        title: 'iPhone 13',
        price: 1500,
        currency: 'ILS',
        observedAt: new Date(),
      } as ListingSnapshot,
      localMarketContext: {
        query: 'iPhone 13',
        currency: 'ILS',
        observationCount: 5,
        dataQuality: 'real',
        typicalPrice: { p25: 1900, p50: 2050, p75: 2200 },
        recentObservations: [],
        notes: [],
      } as LocalMarketContext,
      historicalContext: { query: 'iPhone 13', totalObservations: 0, observations: [] } as HistoricalContext,
      verdict: makeVerdict({ verdict: 'worth_it' }),
    });

    const allText = [result.summary, ...result.positives, ...result.concerns].join(' ').toLowerCase();
    expect(allText).not.toContain('deterministic');
    expect(allText).not.toContain('p50');
    expect(allText).not.toContain('local band');
    expect(allText).not.toContain('observation');
    expect(result.summary.length).toBeGreaterThan(10);
  });

  it('includes low-data warning in summary when dataQuality is seed', async () => {
    const result = await generateNarrative({
      listing: { title: 'Guitar', price: 500, currency: 'ILS', observedAt: new Date() } as ListingSnapshot,
      localMarketContext: {
        query: 'Guitar',
        currency: 'ILS',
        observationCount: 7,
        dataQuality: 'seed',
        typicalPrice: { p25: 600, p50: 700, p75: 800 },
        recentObservations: [],
        notes: [],
      } as LocalMarketContext,
      historicalContext: { query: 'Guitar', totalObservations: 0, observations: [] } as HistoricalContext,
      verdict: makeVerdict({ verdict: 'worth_it' }),
    });

    const allText = [result.summary, ...result.concerns].join(' ').toLowerCase();
    expect(allText).toMatch(/limited|rough|estimated|few/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/shaishargal/worthIT/backend && npm test -- tests/narrative.test.ts
```

Expected: FAIL — summary contains "deterministic" and no low-data warning for seed.

- [ ] **Step 3: Rewrite the system prompt and fallback in `narrative.ts`**

Replace `SYSTEM_PROMPT` and `fallbackNarrative` in `backend/src/ai/narrative.ts`:

```typescript
const SYSTEM_PROMPT = `You are a knowledgeable friend helping someone decide if a second-hand deal in Israel is worth buying.
Your job is to EXPLAIN a verdict that has already been decided — do NOT change it or invent facts.

Return JSON ONLY:
{
  "summary": string,
  "positives": string[],
  "concerns": string[]
}

Rules:
- NEVER use these words: deterministic, p50, local band, observation, ILS, confidence score, percentile.
- summary: 1-2 plain sentences. Say what the price means compared to similar items. Under 40 words.
- positives: 2-3 short bullet phrases (reasons it's a good deal). Empty array for avoid verdict.
- concerns: 2-3 short bullet phrases (things to watch out for). Empty array for worth_it verdict.
- If DATA QUALITY is seed or insufficient: explicitly say in concerns "Limited listings to compare — verify independently."
- Match tone to verdict: enthusiastic for worth_it, balanced for maybe, direct for avoid.
- Output JSON only, no commentary.`;
```

Replace `fallbackNarrative`:

```typescript
function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${Math.round(price)} ${currency}`;
  }
}

function fallbackNarrative(input: NarrativeInput): AiReasoning {
  const { listing, localMarketContext, verdict } = input;
  const typical = localMarketContext.typicalPrice;
  const isLowData = localMarketContext.dataQuality !== 'real';
  const lowDataNote = 'Limited listings to compare — verify independently.';

  const typicalStr = typical ? ` (around ${formatPrice(typical.p50, listing.currency)})` : '';
  const priceStr = formatPrice(listing.price, listing.currency);

  if (verdict.verdict === 'worth_it') {
    return {
      summary: `At ${priceStr}, this is well below what similar items typically sell for${typicalStr}. Looks like a solid deal.`,
      positives: ['Price is below the typical market rate'],
      concerns: isLowData ? [lowDataNote] : [],
    };
  }

  if (verdict.verdict === 'avoid') {
    return {
      summary: `At ${priceStr}, this is above what similar items typically sell for${typicalStr}. You can probably find a better deal.`,
      positives: [],
      concerns: [
        'Above the typical market rate',
        isLowData ? lowDataNote : 'Check other listings for better pricing',
      ],
    };
  }

  // maybe
  return {
    summary: `At ${priceStr}, this is roughly in line with similar items${typicalStr}. Not a standout deal, but not overpriced either.`,
    positives: ['Price is near the typical market rate'],
    concerns: isLowData ? [lowDataNote] : ['Not a standout deal — worth comparing other listings'],
  };
}
```

- [ ] **Step 4: Add `dataQuality` line to `buildUserPrompt`**

In `buildUserPrompt`, add after the confidence line:

```typescript
  `DATA QUALITY: ${localMarketContext.dataQuality}${localMarketContext.dataQuality !== 'real' ? ' — explicitly note limited data in concerns' : ''}`,
```

Place it after this existing line:
```typescript
`Confidence: ${verdict.confidence.toFixed(2)} (${verdict.confidenceLevel})`,
```

- [ ] **Step 5: Run all tests**

```bash
cd /Users/shaishargal/worthIT/backend && npm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/shaishargal/worthIT
git add backend/src/ai/narrative.ts backend/tests/narrative.test.ts
git commit -m "feat: rewrite AI narrative to plain friend-advice language with data quality awareness"
```

---

### Task 4: Fix title extraction on item detail pages

**Files:**
- Modify: `extension/src/content/extractor.ts` — narrow h1 selector to `[role="main"]`

**Interfaces:**
- No interface changes — `extractActiveListing()` signature unchanged

- [ ] **Step 1: Fix the h1 selector in `extractActiveListing`**

In `extension/src/content/extractor.ts`, in the `if (location.pathname.includes('/marketplace/item/'))` block, replace:

```typescript
// BEFORE
const title =
  document.querySelector('h1')?.textContent?.trim() ??
  pickTitle(
    getInnerText(main)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  );
```

With:

```typescript
// AFTER — look for h1 within the main content area, not the global page h1
const title =
  (main as Element).querySelector('h1')?.textContent?.trim() ??
  pickTitle(
    getInnerText(main)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  );
```

- [ ] **Step 2: Build and verify**

```bash
cd /Users/shaishargal/worthIT/extension && npm run build
```

Expected: Build succeeds with no errors.

Then in Chrome: go to `chrome://extensions` → reload WorthIT → open a Facebook Marketplace item page (URL contains `/marketplace/item/`) → click Analyze Product → the overlay title should show the real product name, not "Marketplace".

- [ ] **Step 3: Commit**

```bash
cd /Users/shaishargal/worthIT
git add extension/src/content/extractor.ts
git commit -m "fix: extract product title from main content area, not Facebook site h1"
```

---

### Task 5: Click-to-select mode for browse pages

**Files:**
- Modify: `extension/src/content/extractor.ts` — export `extractFromAnchor` and `fallbackCurrencyFromPage`
- Create: `extension/src/content/selection.ts` — dim overlay + hover highlight + click handler
- Modify: `extension/src/content/analyze-runtime.ts` — dispatch to selection or direct based on page type
- Modify: `extension/src/popup/popup.ts` — contextual hint text

**Interfaces:**
- Consumes: `extractFromAnchor(anchor, pageCcy)` and `fallbackCurrencyFromPage()` exported from `extractor.ts`
- Produces: `enterSelectionMode(): Promise<ProductInput | null>` from `selection.ts`

- [ ] **Step 1: Export helpers from `extractor.ts`**

In `extension/src/content/extractor.ts`, change `function extractFromAnchor` and `function fallbackCurrencyFromPage` from private to exported:

```typescript
// Change these two function declarations from:
function fallbackCurrencyFromPage(): string {

// To:
export function fallbackCurrencyFromPage(): string {
```

```typescript
// Change:
function extractFromAnchor(anchor: HTMLAnchorElement, pageCcy: string): ProductInput | null {

// To:
export function extractFromAnchor(anchor: HTMLAnchorElement, pageCcy: string): ProductInput | null {
```

- [ ] **Step 2: Create `extension/src/content/selection.ts`**

```typescript
import type { ProductInput } from '../../../shared/types/index.js';
import { extractFromAnchor, fallbackCurrencyFromPage } from './extractor.js';

const OVERLAY_ID = 'worthit-select-overlay';
const STYLE_ID = 'worthit-select-style';

export function enterSelectionMode(): Promise<ProductInput | null> {
  return new Promise((resolve) => {
    // Dim overlay — pointer-events none so cards remain clickable
    const dimEl = document.createElement('div');
    dimEl.id = OVERLAY_ID;
    Object.assign(dimEl.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.35)',
      zIndex: '2147483640',
      pointerEvents: 'none',
    });
    document.body.appendChild(dimEl);

    // CSS for card highlight on hover
    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = `
      a[href*="/marketplace/item/"]:hover {
        outline: 3px solid #22c55e !important;
        outline-offset: 3px !important;
        cursor: pointer !important;
        position: relative;
        z-index: 2147483641 !important;
      }
    `;
    document.head.appendChild(styleEl);

    function cleanup(): void {
      document.getElementById(OVERLAY_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
      document.removeEventListener('click', onCardClick, true);
      document.removeEventListener('keydown', onKeyDown);
    }

    function onCardClick(e: MouseEvent): void {
      const anchor = (e.target as Element).closest(
        'a[href*="/marketplace/item/"]',
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      const product = extractFromAnchor(anchor, fallbackCurrencyFromPage());
      resolve(product);
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    }

    document.addEventListener('click', onCardClick, true);
    document.addEventListener('keydown', onKeyDown);
  });
}
```

- [ ] **Step 3: Update `analyze-runtime.ts`**

Replace the full contents of `extension/src/content/analyze-runtime.ts`:

```typescript
import { analyzeProduct } from '../services/api.js';
import { extractActiveListing } from './extractor.js';
import { mountOverlay, type OverlayHandle } from './overlay.js';
import { enterSelectionMode } from './selection.js';

let activeOverlay: OverlayHandle | null = null;

function isItemDetailPage(): boolean {
  return location.pathname.includes('/marketplace/item/');
}

export async function runAnalyze(): Promise<void> {
  let product;

  if (isItemDetailPage()) {
    product = extractActiveListing();
    if (!product) {
      const overlay = mountOverlay();
      activeOverlay = overlay;
      overlay.showError(
        'Could not read this listing. Try reloading the page.',
        () => { void runAnalyze(); },
      );
      return;
    }
  } else {
    // Browse page — let user pick which card to analyze
    product = await enterSelectionMode();
    if (!product) return; // user pressed Escape
  }

  const overlay = mountOverlay();
  activeOverlay = overlay;
  overlay.showLoading(product.title);

  try {
    const response = await analyzeProduct(product);
    if (overlay !== activeOverlay) return;
    overlay.showResult(response);
  } catch (err) {
    if (overlay !== activeOverlay) return;
    const message = err instanceof Error ? err.message : 'Unknown error';
    overlay.showError(message, () => { void runAnalyze(); });
  }
}
```

- [ ] **Step 4: Update `popup.ts` with contextual hint text**

Replace `popup.ts` with:

```typescript
import { getApiBase } from '../services/api.js';

const button = document.getElementById('analyze') as HTMLButtonElement | null;
const status = document.getElementById('status') as HTMLParagraphElement | null;
const apiBaseLabel = document.getElementById('api-base') as HTMLElement | null;

function setStatus(text: string, tone: 'info' | 'error' = 'info'): void {
  if (!status) return;
  status.textContent = text;
  status.setAttribute('data-tone', tone);
}

async function waitForContentScript(tabId: number): Promise<void> {
  let last: unknown;
  for (let i = 0; i < 10; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'WORTHIT_PING' });
      return;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw last instanceof Error ? last : new Error('Content script unreachable');
}

function isMarketplaceUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.endsWith('facebook.com') && u.pathname.startsWith('/marketplace');
  } catch {
    return false;
  }
}

function isItemDetailPage(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.endsWith('facebook.com') && u.pathname.includes('/marketplace/item/');
  } catch {
    return false;
  }
}

async function init(): Promise<void> {
  if (apiBaseLabel) {
    apiBaseLabel.textContent = await getApiBase();
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onMarketplace = isMarketplaceUrl(tab?.url);

  if (!button) return;

  if (!onMarketplace) {
    button.disabled = true;
    setStatus('Open a Facebook Marketplace page first.');
    return;
  }

  if (isItemDetailPage(tab?.url)) {
    setStatus('Ready. Click Analyze Product.');
  } else {
    setStatus('Click Analyze, then pick a listing.');
  }

  button.addEventListener('click', async () => {
    if (!tab?.id) return;
    button.disabled = true;
    setStatus('Loading…');
    try {
      await waitForContentScript(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: 'WORTHIT_ANALYZE' });
      window.close();
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to message the page';
      const hint =
        raw.includes('Receiving end')
          ? ' Reload this Marketplace tab so the WorthIT bridge loads.'
          : '';
      setStatus(`${raw}.${hint}`, 'error');
      button.disabled = false;
    }
  });
}

void init();
```

- [ ] **Step 5: Build and verify**

```bash
cd /Users/shaishargal/worthIT/extension && npm run build
```

Expected: Build succeeds.

Then in Chrome: reload the extension → open the Facebook Marketplace browse page → open popup → should say "Click Analyze, then pick a listing." → click Analyze → page dims with dark overlay → hover over a card (green border appears) → click a card → overlay disappears and WorthIT result shows in top-right. Also verify item detail page still works directly.

- [ ] **Step 6: Commit**

```bash
cd /Users/shaishargal/worthIT
git add extension/src/content/extractor.ts extension/src/content/selection.ts extension/src/content/analyze-runtime.ts extension/src/popup/popup.ts
git commit -m "feat: click-to-select mode on browse pages — dim overlay and hover-to-pick a listing"
```

---

### Task 6: Data quality warning banner in overlay

**Files:**
- Modify: `extension/src/content/overlay.ts` — add yellow banner when dataQuality is seed or insufficient

**Interfaces:**
- Consumes: `AnalyzeProductResponse.localMarketContext.dataQuality: 'real' | 'seed' | 'insufficient'` (from Task 1 — already in the API response)

- [ ] **Step 1: Add `buildDataQualityBanner` to `overlay.ts`**

Add this function before `buildResultCard` in `extension/src/content/overlay.ts`:

```typescript
function buildDataQualityBanner(dataQuality: 'real' | 'seed' | 'insufficient'): HTMLDivElement | null {
  if (dataQuality === 'real') return null;

  const text =
    dataQuality === 'seed'
      ? '⚠ Estimated prices — no local sales data yet'
      : '⚠ Limited data — fewer than 5 local sales found';

  return el(
    'div',
    {
      padding: '6px 10px',
      background: '#fef9c3',
      border: '1px solid #fde047',
      borderRadius: '8px',
      fontSize: '11px',
      color: '#854d0e',
      fontWeight: '500',
    },
    text,
  );
}
```

- [ ] **Step 2: Show the banner in `showResult`**

In `overlay.ts`, inside the `mountOverlay()` return object, update `showResult`:

```typescript
showResult(response) {
  clearBody();
  setSubheader('Analysis complete');
  const banner = buildDataQualityBanner(response.localMarketContext.dataQuality);
  if (banner) body.appendChild(banner);
  body.appendChild(buildResultCard(response));
},
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/shaishargal/worthIT/extension && npm run build
```

Expected: Build succeeds.

Then in Chrome: reload extension → analyze a product → if using seed data, a yellow banner should appear above the result card saying "⚠ Estimated prices — no local sales data yet". The confidence percentage should also now be much lower (≤30% for seed data, coming from the backend changes in Task 2).

- [ ] **Step 4: Run backend tests one final time to confirm nothing broken**

```bash
cd /Users/shaishargal/worthIT/backend && npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/shaishargal/worthIT
git add extension/src/content/overlay.ts
git commit -m "feat: show data quality warning banner in overlay when using seed or insufficient data"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| Fix title extraction (`[role="main"] h1`) | Task 4 |
| Click-to-select: dim overlay on browse pages | Task 5 |
| Click-to-select: green border on card hover | Task 5 |
| Click-to-select: Escape cancels | Task 5 |
| Popup hint: "Ready" vs "pick a listing" vs disabled | Task 5 |
| New AI system prompt (plain language, no jargon) | Task 3 |
| Plain fallback narrative | Task 3 |
| `dataQuality` field in `LocalMarketContext` | Task 1 |
| `dataQuality` set to seed/insufficient/real | Task 1 |
| Confidence capped at 30% for seed | Task 2 |
| Confidence capped at 50% for insufficient | Task 2 |
| Yellow banner for seed/insufficient | Task 6 |
| `dataQuality` passed to AI prompt context | Task 3 |

### Type consistency check
- `dataQuality: 'real' | 'seed' | 'insufficient'` — defined in Task 1 (`shared/types/market.ts`), consumed in Tasks 2, 3, 6. Exact string literals used consistently.
- `extractFromAnchor(anchor: HTMLAnchorElement, pageCcy: string): ProductInput | null` — exported in Task 5 step 1, consumed in `selection.ts` Task 5 step 2. ✓
- `fallbackCurrencyFromPage(): string` — exported in Task 5 step 1, consumed in `selection.ts`. ✓
- `enterSelectionMode(): Promise<ProductInput | null>` — defined in Task 5 step 2, consumed in `analyze-runtime.ts` Task 5 step 3. ✓
- `buildDataQualityBanner(dataQuality: 'real' | 'seed' | 'insufficient'): HTMLDivElement | null` — defined and consumed in Task 6. ✓
