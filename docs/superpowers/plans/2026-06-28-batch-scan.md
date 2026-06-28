# Batch Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Scan All" button to the WorthIT popup on Facebook Marketplace search pages that extracts visible listings, pre-screens them cheaply, runs full AI analysis on the top 5 candidates, and shows a live-updating ranked results list.

**Architecture:** Extension-only change — no backend modifications. A new `preScreen.ts` module filters and ranks raw listings by price and red flags. A new `listings-runtime.ts` content script bundle is dynamically loaded by the bridge to return DOM-extracted listings to the popup. The popup orchestrates sequential `analyzeProduct` calls and updates the UI as each result arrives.

**Tech Stack:** TypeScript, Vite + esbuild (extension build), Chrome MV3 APIs, Vitest + jsdom (tests)

## Global Constraints

- TypeScript strict mode — no untyped `any`
- No new backend endpoints — use existing `POST /analysis/analyze` via `analyzeProduct()`
- All tests run with `cd /Users/shaishargal/worthIT/extension && npm test`
- Test runner: Vitest, environment: jsdom (URL base: `https://www.facebook.com/`)
- Extension content scripts: esbuild bundles; popup + background: Vite/crx
- Popup width: 280px; Chrome max popup height: 600px (scan results area capped at 340px)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `extension/src/marketplace/preScreen.ts` | Red-flag detection + price-sorted candidate selection |
| Create | `extension/src/content/listings-runtime.ts` | Thin ESM entry — exports `getListings()` for bridge |
| Create | `extension/src/popup/scanHelpers.ts` | Pure helpers: `isSearchPage`, `resolveListingUrl`, `starsHtml`, `buildResultCard` |
| Create | `extension/tests/unit/preScreen.test.ts` | Unit tests for preScreen |
| Create | `extension/tests/unit/scanHelpers.test.ts` | Unit tests for scanHelpers |
| Modify | `extension/src/content/worthit-bridge.js` | Add `WORTHIT_GET_LISTINGS` message handler |
| Modify | `extension/vite.config.ts` | Add esbuild entry for `worthit-listings.js` |
| Modify | `extension/src/popup/popup.html` | Add `#scan-btn`, `#scan-results` |
| Modify | `extension/src/popup/popup.css` | Add scan button + result card styles |
| Modify | `extension/src/popup/popup.ts` | Add scan flow, import scanHelpers + preScreen |

---

## Task 1: Pre-Screen Module

**Files:**
- Create: `extension/src/marketplace/preScreen.ts`
- Create: `extension/tests/unit/preScreen.test.ts`

**Interfaces:**
- Consumes: `ObservedListing` from `./types.js`
- Produces:
  - `hasRedFlag(title: string): boolean`
  - `preScreen(listings: ObservedListing[], topN?: number): ObservedListing[]`

- [ ] **Step 1: Write the failing tests**

Create `extension/tests/unit/preScreen.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hasRedFlag, preScreen } from '../../src/marketplace/preScreen.js';
import type { ObservedListing } from '../../src/marketplace/types.js';

function makeListing(overrides: Partial<ObservedListing> = {}): ObservedListing {
  return {
    marketplace: 'facebook',
    listingId: '1',
    listingUrl: '/marketplace/item/1',
    title: 'PS5 Console',
    price: 1500,
    currency: 'ILS',
    searchQuery: 'ps5',
    observedAt: new Date(),
    ...overrides,
  };
}

describe('hasRedFlag', () => {
  it('returns false for a clean title', () => {
    expect(hasRedFlag('PS5 Console 256GB')).toBe(false);
  });
  it('detects English as-is', () => {
    expect(hasRedFlag('PS5 as is, works')).toBe(true);
  });
  it('detects Hebrew כפי שהוא', () => {
    expect(hasRedFlag('פלייסטיישן 5 כפי שהוא')).toBe(true);
  });
  it('detects untested', () => {
    expect(hasRedFlag('MacBook untested')).toBe(true);
  });
  it('detects לא בדוק', () => {
    expect(hasRedFlag('מחשב לא בדוק')).toBe(true);
  });
  it('detects חייב למכור', () => {
    expect(hasRedFlag('חייב למכור PS5')).toBe(true);
  });
  it('detects urgent', () => {
    expect(hasRedFlag('urgent sale PS5')).toBe(true);
  });
  it('detects ללא מטען', () => {
    expect(hasRedFlag('MacBook Air ללא מטען')).toBe(true);
  });
  it('detects no charger', () => {
    expect(hasRedFlag('MacBook no charger')).toBe(true);
  });
  it('detects שלט אחד', () => {
    expect(hasRedFlag('PS5 שלט אחד בלבד')).toBe(true);
  });
  it('detects one controller', () => {
    expect(hasRedFlag('PS5 one controller only')).toBe(true);
  });
  it('detects כנסו לתיאור', () => {
    expect(hasRedFlag('כנסו לתיאור')).toBe(true);
  });
  it('is case-insensitive for English patterns', () => {
    expect(hasRedFlag('PS5 AS IS condition')).toBe(true);
  });
});

describe('preScreen', () => {
  it('returns empty array for empty input', () => {
    expect(preScreen([])).toEqual([]);
  });
  it('sorts clean listings by price ascending', () => {
    const a = makeListing({ listingId: '1', price: 2000 });
    const b = makeListing({ listingId: '2', price: 1000 });
    const c = makeListing({ listingId: '3', price: 1500 });
    expect(preScreen([a, b, c]).map((l) => l.price)).toEqual([1000, 1500, 2000]);
  });
  it('puts red-flagged listings after clean ones regardless of price', () => {
    const clean = makeListing({ listingId: '1', title: 'PS5 Console', price: 1000 });
    const flagged = makeListing({ listingId: '2', title: 'PS5 as is', price: 500 });
    const result = preScreen([flagged, clean]);
    expect(result[0].listingId).toBe('1');
    expect(result[1].listingId).toBe('2');
  });
  it('returns all listings when count is below topN', () => {
    const listings = [makeListing({ listingId: '1' }), makeListing({ listingId: '2' })];
    expect(preScreen(listings, 5)).toHaveLength(2);
  });
  it('truncates to topN', () => {
    const listings = Array.from({ length: 10 }, (_, i) =>
      makeListing({ listingId: String(i), price: i * 100 }),
    );
    expect(preScreen(listings, 5)).toHaveLength(5);
  });
  it('returns cheapest flagged listings when all are red-flagged', () => {
    const a = makeListing({ listingId: '1', title: 'PS5 as is', price: 2000 });
    const b = makeListing({ listingId: '2', title: 'iPad untested', price: 500 });
    const result = preScreen([a, b], 5);
    expect(result).toHaveLength(2);
    expect(result[0].price).toBe(500);
  });
  it('uses default topN of 5', () => {
    const listings = Array.from({ length: 8 }, (_, i) =>
      makeListing({ listingId: String(i) }),
    );
    expect(preScreen(listings)).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/shaishargal/worthIT/extension && npm test -- preScreen
```

Expected: `Error: Cannot find module '../../src/marketplace/preScreen.js'`

- [ ] **Step 3: Implement preScreen.ts**

Create `extension/src/marketplace/preScreen.ts`:

```ts
import type { ObservedListing } from './types.js';

const RED_FLAG_PATTERNS: RegExp[] = [
  /as.?is/i,
  /כפי שהוא/,
  /untested/i,
  /לא בדוק/,
  /חייב למכור/,
  /urgent/i,
  /ללא מטען/,
  /no charger/i,
  /שלט אחד/,
  /one controller/i,
  /כנסו לתיאור/,
];

export function hasRedFlag(title: string): boolean {
  return RED_FLAG_PATTERNS.some((p) => p.test(title));
}

export function preScreen(listings: ObservedListing[], topN = 5): ObservedListing[] {
  if (listings.length === 0) return [];
  const clean = listings.filter((l) => !hasRedFlag(l.title));
  const flagged = listings.filter((l) => hasRedFlag(l.title));
  const sorted = [
    ...clean.sort((a, b) => a.price - b.price),
    ...flagged.sort((a, b) => a.price - b.price),
  ];
  return sorted.slice(0, topN);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/shaishargal/worthIT/extension && npm test -- preScreen
```

Expected: All 19 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/shaishargal/worthIT && git add extension/src/marketplace/preScreen.ts extension/tests/unit/preScreen.test.ts && git commit -m "feat: add preScreen module for batch scan candidate filtering"
```

---

## Task 2: Listings Content Script + Build Wiring

**Files:**
- Create: `extension/src/content/listings-runtime.ts`
- Modify: `extension/vite.config.ts`
- Modify: `extension/src/content/worthit-bridge.js`

**Interfaces:**
- Consumes: `extractListingsFromSearchPage` from `../marketplace/listingExtractor.js`
- Produces: `getListings(): ObservedListing[]` — exported from `dist/assets/worthit-listings.js`, invoked by the bridge via dynamic import

No unit tests for this task — the bridge is a plain JS file tested manually via extension reload.

- [ ] **Step 1: Create listings-runtime.ts**

Create `extension/src/content/listings-runtime.ts`:

```ts
import { extractListingsFromSearchPage } from '../marketplace/listingExtractor.js';

export function getListings() {
  return extractListingsFromSearchPage();
}
```

- [ ] **Step 2: Add esbuild entry in vite.config.ts**

In `extension/vite.config.ts`, inside `bundleContentScripts`'s `closeBundle`, add after the two existing `esbuild.build` calls:

```ts
await esbuild.build({
  entryPoints: [path.join(extensionRoot, 'src/content/listings-runtime.ts')],
  absWorkingDir: repoRoot,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: path.join(extensionRoot, 'dist/assets/worthit-listings.js'),
});
```

The manifest already declares `resources: ['assets/*']` — no manifest change needed.

- [ ] **Step 3: Add WORTHIT_GET_LISTINGS handler to worthit-bridge.js**

In `extension/src/content/worthit-bridge.js`, inside the `chrome.runtime.onMessage.addListener` callback, add before the final `return false`:

```js
if (msg.type === 'WORTHIT_GET_LISTINGS') {
  import(chrome.runtime.getURL('assets/worthit-listings.js'))
    .then(function (mod) {
      sendResponse(mod.getListings());
    })
    .catch(function (err) {
      console.warn('[WorthIT] Failed to get listings:', err);
      sendResponse([]);
    });
  return true; // keep channel open for async sendResponse
}
```

- [ ] **Step 4: Build and verify the new bundle is produced**

```bash
cd /Users/shaishargal/worthIT/extension && npm run build && ls dist/assets/worthit-listings.js
```

Expected: Build succeeds; file is listed.

- [ ] **Step 5: Commit**

```bash
cd /Users/shaishargal/worthIT && git add extension/src/content/listings-runtime.ts extension/vite.config.ts extension/src/content/worthit-bridge.js && git commit -m "feat: add listings-runtime bundle and WORTHIT_GET_LISTINGS bridge handler"
```

---

## Task 3: Scan Helper Functions + Tests

**Files:**
- Create: `extension/src/popup/scanHelpers.ts`
- Create: `extension/tests/unit/scanHelpers.test.ts`

**Interfaces:**
- Consumes: `AnalyzeProductResponse` from `../../../shared/types/index.js`
- Produces:
  - `isSearchPage(url: string | undefined): boolean`
  - `resolveListingUrl(url: string): string`
  - `starsHtml(rating: number): string`
  - `buildResultCard(rank: number, listing: { title: string; price: number; listingUrl: string }, analysis: AnalyzeProductResponse | null): HTMLElement`

- [ ] **Step 1: Write the failing tests**

Create `extension/tests/unit/scanHelpers.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { isSearchPage, resolveListingUrl, starsHtml, buildResultCard } from '../../src/popup/scanHelpers.js';
import type { AnalyzeProductResponse } from '../../../shared/types/index.js';

const MOCK_ANALYSIS: AnalyzeProductResponse = {
  analysisId: 'abc123',
  listing: {
    title: 'PS5 Console',
    price: 1500,
    currency: 'ILS',
    source: 'facebook',
    observedAt: new Date(),
  },
  localMarketContext: {
    query: 'ps5',
    currency: 'ILS',
    observationCount: 5,
    dataQuality: 'real',
    recentObservations: [],
    notes: [],
  },
  historicalContext: {
    query: 'ps5',
    totalObservations: 5,
    observations: [],
  },
  verdict: {
    verdict: 'worth_it',
    worthRating: 4,
    confidence: 0.8,
    confidenceLevel: 'high',
  },
  reasoning: {
    summary: 'Good deal',
    positives: ['Reasonable price'],
    concerns: [],
  },
};

describe('isSearchPage', () => {
  it('returns true for city-prefixed search URL', () => {
    expect(isSearchPage('https://www.facebook.com/marketplace/telaviv/search/?query=ps5')).toBe(true);
  });
  it('returns true for bare /marketplace/search URL', () => {
    expect(isSearchPage('https://www.facebook.com/marketplace/search/?query=iphone')).toBe(true);
  });
  it('returns false for item detail page', () => {
    expect(isSearchPage('https://www.facebook.com/marketplace/item/123456')).toBe(false);
  });
  it('returns false for non-marketplace URL', () => {
    expect(isSearchPage('https://www.facebook.com/groups/123')).toBe(false);
  });
  it('returns false for undefined', () => {
    expect(isSearchPage(undefined)).toBe(false);
  });
  it('returns false when query param is absent', () => {
    expect(isSearchPage('https://www.facebook.com/marketplace/telaviv/search/')).toBe(false);
  });
});

describe('resolveListingUrl', () => {
  it('returns absolute URL unchanged', () => {
    expect(resolveListingUrl('https://www.facebook.com/marketplace/item/123')).toBe(
      'https://www.facebook.com/marketplace/item/123',
    );
  });
  it('prepends facebook.com to a root-relative URL', () => {
    expect(resolveListingUrl('/marketplace/item/123')).toBe(
      'https://www.facebook.com/marketplace/item/123',
    );
  });
});

describe('starsHtml', () => {
  it('returns 5 filled stars for rating 5', () => {
    expect(starsHtml(5)).toBe('★★★★★');
  });
  it('returns 3 filled + 2 empty for rating 3', () => {
    expect(starsHtml(3)).toBe('★★★☆☆');
  });
  it('returns all empty for rating 0', () => {
    expect(starsHtml(0)).toBe('☆☆☆☆☆');
  });
  it('clamps values above 5', () => {
    expect(starsHtml(7)).toBe('★★★★★');
  });
});

describe('buildResultCard', () => {
  it('renders rank badge', () => {
    const card = buildResultCard(1, { title: 'PS5', price: 1500, listingUrl: '/marketplace/item/1' }, MOCK_ANALYSIS);
    expect(card.querySelector('.scan-card__rank')?.textContent).toBe('#1');
  });
  it('truncates title longer than 35 chars', () => {
    const longTitle = 'A'.repeat(40);
    const card = buildResultCard(1, { title: longTitle, price: 1500, listingUrl: '/marketplace/item/1' }, MOCK_ANALYSIS);
    expect(card.querySelector('.scan-card__title')?.textContent).toHaveLength(36); // 35 + '…'
  });
  it('does not truncate titles of 35 chars or fewer', () => {
    const card = buildResultCard(1, { title: 'Short title', price: 1500, listingUrl: '/marketplace/item/1' }, MOCK_ANALYSIS);
    expect(card.querySelector('.scan-card__title')?.textContent).toBe('Short title');
  });
  it('renders star rating when analysis is provided', () => {
    const card = buildResultCard(1, { title: 'PS5', price: 1500, listingUrl: '/marketplace/item/1' }, MOCK_ANALYSIS);
    expect(card.querySelector('.scan-card__stars')?.textContent).toBe('★★★★☆'); // rating 4
  });
  it('renders error placeholder when analysis is null', () => {
    const card = buildResultCard(1, { title: 'PS5', price: 1500, listingUrl: '/marketplace/item/1' }, null);
    expect(card.querySelector('.scan-card__error')?.textContent).toBe('⚠ Could not analyze');
  });
  it('renders View link with resolved absolute URL', () => {
    const card = buildResultCard(1, { title: 'PS5', price: 1500, listingUrl: '/marketplace/item/1' }, null);
    const link = card.querySelector('.scan-card__view') as HTMLAnchorElement;
    expect(link?.href).toBe('https://www.facebook.com/marketplace/item/1');
  });
  it('renders price with thousands separator', () => {
    const card = buildResultCard(1, { title: 'PS5', price: 1500, listingUrl: '/marketplace/item/1' }, MOCK_ANALYSIS);
    expect(card.querySelector('.scan-card__price')?.textContent).toContain('1,500');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/shaishargal/worthIT/extension && npm test -- scanHelpers
```

Expected: `Error: Cannot find module '../../src/popup/scanHelpers.js'`

- [ ] **Step 3: Implement scanHelpers.ts**

Create `extension/src/popup/scanHelpers.ts`:

```ts
import type { AnalyzeProductResponse } from '../../../shared/types/index.js';

export function isSearchPage(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      u.hostname.endsWith('facebook.com') &&
      u.pathname.startsWith('/marketplace') &&
      u.searchParams.has('query')
    );
  } catch {
    return false;
  }
}

export function resolveListingUrl(url: string): string {
  if (url.startsWith('http')) return url;
  return `https://www.facebook.com${url.startsWith('/') ? '' : '/'}${url}`;
}

export function starsHtml(rating: number): string {
  const clamped = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
}

export function buildResultCard(
  rank: number,
  listing: { title: string; price: number; listingUrl: string },
  analysis: AnalyzeProductResponse | null,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'scan-card';

  const rankEl = document.createElement('span');
  rankEl.className = 'scan-card__rank';
  rankEl.textContent = `#${rank}`;

  const body = document.createElement('div');
  body.className = 'scan-card__body';

  const titleEl = document.createElement('div');
  titleEl.className = 'scan-card__title';
  titleEl.title = listing.title;
  titleEl.textContent =
    listing.title.length > 35 ? listing.title.slice(0, 35) + '…' : listing.title;

  const meta = document.createElement('div');
  meta.className = 'scan-card__meta';

  const priceEl = document.createElement('span');
  priceEl.className = 'scan-card__price';
  priceEl.textContent = `₪${listing.price.toLocaleString()}`;
  meta.appendChild(priceEl);

  if (analysis) {
    const starsEl = document.createElement('span');
    starsEl.className = 'scan-card__stars';
    starsEl.textContent = starsHtml(analysis.verdict.worthRating);
    meta.appendChild(starsEl);
  } else {
    const errEl = document.createElement('span');
    errEl.className = 'scan-card__error';
    errEl.textContent = '⚠ Could not analyze';
    meta.appendChild(errEl);
  }

  body.appendChild(titleEl);
  body.appendChild(meta);

  const href = resolveListingUrl(listing.listingUrl);
  const viewLink = document.createElement('a');
  viewLink.className = 'scan-card__view';
  viewLink.textContent = 'View →';
  viewLink.href = href;

  card.appendChild(rankEl);
  card.appendChild(body);
  card.appendChild(viewLink);

  return card;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/shaishargal/worthIT/extension && npm test -- scanHelpers
```

Expected: All 14 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/shaishargal/worthIT && git add extension/src/popup/scanHelpers.ts extension/tests/unit/scanHelpers.test.ts && git commit -m "feat: add scanHelpers for popup scan result rendering"
```

---

## Task 4: Popup HTML, CSS, and Scan Flow

**Files:**
- Modify: `extension/src/popup/popup.html`
- Modify: `extension/src/popup/popup.css`
- Modify: `extension/src/popup/popup.ts`

**Interfaces:**
- Consumes (all already built in prior tasks):
  - `isSearchPage`, `buildResultCard`, `resolveListingUrl` from `./scanHelpers.js`
  - `preScreen` from `../marketplace/preScreen.js`
  - `analyzeProduct`, `getApiBase` from `../services/api.js`
  - `ObservedListing` from `../marketplace/types.js`
  - `AnalyzeProductResponse` from `../../../shared/types/index.js`

- [ ] **Step 1: Update popup.html**

Replace the full contents of `extension/src/popup/popup.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>WorthIT</title>
    <link rel="stylesheet" href="./popup.css" />
  </head>
  <body>
    <div class="popup">
      <header class="popup__header">
        <span class="popup__logo">W</span>
        <div>
          <h1 class="popup__title">WorthIT</h1>
          <p class="popup__subtitle">Analyze this marketplace listing.</p>
        </div>
      </header>

      <button id="analyze" class="popup__btn">Analyze Product</button>
      <button id="scan" class="popup__btn popup__btn--scan" style="display:none">Scan All</button>

      <p id="status" class="popup__status" role="status" aria-live="polite"></p>

      <div id="scan-results" class="scan-results" style="display:none"></div>

      <footer class="popup__footer">
        <span>Backend:</span>
        <code id="api-base">http://localhost:4000</code>
      </footer>
    </div>
    <script type="module" src="./popup.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Append scan styles to popup.css**

Append to the end of `extension/src/popup/popup.css`:

```css
.popup__btn--scan {
  background: #0ea5e9;
}

.popup__btn--scan:hover:not(:disabled) {
  background: #0284c7;
}

.scan-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 340px;
  overflow-y: auto;
}

.scan-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.scan-card__rank {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  min-width: 22px;
  padding-top: 1px;
}

.scan-card__body {
  flex: 1;
  min-width: 0;
}

.scan-card__title {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scan-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.scan-card__price {
  font-size: 11px;
  color: #475569;
}

.scan-card__stars {
  font-size: 11px;
  color: #f59e0b;
}

.scan-card__error {
  font-size: 11px;
  color: #b91c1c;
}

.scan-card__view {
  font-size: 11px;
  font-weight: 600;
  color: #0ea5e9;
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
  padding-top: 1px;
  cursor: pointer;
}

.scan-card__view:hover {
  text-decoration: underline;
}
```

- [ ] **Step 3: Rewrite popup.ts**

Replace the full contents of `extension/src/popup/popup.ts`:

```ts
import { getApiBase, analyzeProduct } from '../services/api.js';
import { isSearchPage, buildResultCard, resolveListingUrl } from './scanHelpers.js';
import { preScreen } from '../marketplace/preScreen.js';
import type { ObservedListing } from '../marketplace/types.js';
import type { AnalyzeProductResponse } from '../../../shared/types/index.js';

const analyzeBtn = document.getElementById('analyze') as HTMLButtonElement | null;
const scanBtn = document.getElementById('scan') as HTMLButtonElement | null;
const statusEl = document.getElementById('status') as HTMLParagraphElement | null;
const scanResults = document.getElementById('scan-results') as HTMLElement | null;
const apiBaseLabel = document.getElementById('api-base') as HTMLElement | null;

function setStatus(text: string, tone: 'info' | 'error' = 'info'): void {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.setAttribute('data-tone', tone);
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

async function getListingsFromTab(tabId: number): Promise<ObservedListing[]> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'WORTHIT_GET_LISTINGS' }, (response) => {
      if (chrome.runtime.lastError || !Array.isArray(response)) {
        resolve([]);
      } else {
        resolve(response as ObservedListing[]);
      }
    });
  });
}

function attachViewHandler(card: HTMLElement, url: string): void {
  card.querySelector('.scan-card__view')?.addEventListener('click', (e) => {
    e.preventDefault();
    void chrome.tabs.create({ url });
  });
}

async function runScan(tabId: number): Promise<void> {
  if (!scanBtn || !scanResults) return;

  scanBtn.disabled = true;
  scanResults.style.display = 'flex';
  scanResults.innerHTML = '';
  setStatus('Gathering listings…');

  const rawListings = await getListingsFromTab(tabId);
  const candidates = preScreen(rawListings);

  if (candidates.length === 0) {
    setStatus('No listings found on this page. Try scrolling first.', 'error');
    scanBtn.disabled = false;
    return;
  }

  const results: Array<{ listing: ObservedListing; analysis: AnalyzeProductResponse | null }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const listing = candidates[i];
    setStatus(`Analyzing ${i + 1}/${candidates.length}…`);

    let analysis: AnalyzeProductResponse | null = null;
    try {
      analysis = await analyzeProduct({
        title: listing.title,
        price: listing.price,
        currency: listing.currency,
        url: resolveListingUrl(listing.listingUrl),
      });
    } catch {
      // analysis stays null — card will show error placeholder
    }

    results.push({ listing, analysis });
    const card = buildResultCard(i + 1, listing, analysis);
    attachViewHandler(card, resolveListingUrl(listing.listingUrl));
    scanResults.appendChild(card);
  }

  // Re-sort by worthRating descending and re-render
  const sorted = [...results].sort(
    (a, b) =>
      (b.analysis?.verdict.worthRating ?? 0) - (a.analysis?.verdict.worthRating ?? 0),
  );
  scanResults.innerHTML = '';
  sorted.forEach((r, idx) => {
    const card = buildResultCard(idx + 1, r.listing, r.analysis);
    attachViewHandler(card, resolveListingUrl(r.listing.listingUrl));
    scanResults.appendChild(card);
  });

  setStatus(`Done — top ${sorted.length} deal${sorted.length !== 1 ? 's' : ''}`);
  scanBtn.textContent = 'Scan Again';
  scanBtn.disabled = false;
}

async function init(): Promise<void> {
  if (apiBaseLabel) {
    apiBaseLabel.textContent = await getApiBase();
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onMarketplace = isMarketplaceUrl(tab?.url);

  if (!onMarketplace) {
    if (analyzeBtn) analyzeBtn.disabled = true;
    setStatus('Open a Facebook Marketplace page first.');
    return;
  }

  if (isItemDetailPage(tab?.url)) {
    if (scanBtn) scanBtn.style.display = 'none';
    setStatus('Ready. Click Analyze Product.');

    analyzeBtn?.addEventListener('click', async () => {
      if (!tab?.id) return;
      analyzeBtn.disabled = true;
      setStatus('Loading…');
      try {
        await waitForContentScript(tab.id);
        await chrome.tabs.sendMessage(tab.id, { type: 'WORTHIT_ANALYZE' });
        window.close();
      } catch (err) {
        const raw = err instanceof Error ? err.message : 'Failed to message the page';
        const hint = raw.includes('Receiving end')
          ? ' Reload this Marketplace tab so the WorthIT bridge loads.'
          : '';
        setStatus(`${raw}.${hint}`, 'error');
        analyzeBtn.disabled = false;
      }
    });
  } else if (isSearchPage(tab?.url)) {
    if (analyzeBtn) analyzeBtn.style.display = 'none';
    if (scanBtn) scanBtn.style.display = '';
    setStatus('Scan visible listings for the best deals.');

    scanBtn?.addEventListener('click', () => {
      if (!tab?.id) return;
      void runScan(tab.id);
    });
  } else {
    if (analyzeBtn) analyzeBtn.disabled = true;
    setStatus('Open a specific listing to analyze it.');
  }
}

void init();
```

- [ ] **Step 4: Build — verify TypeScript compiles**

```bash
cd /Users/shaishargal/worthIT/extension && npm run build
```

Expected: Build completes with no errors.

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/shaishargal/worthIT/extension && npm test
```

Expected: All tests pass (existing 96 + new preScreen 19 + new scanHelpers 14).

- [ ] **Step 6: Manual smoke test**

1. Load `extension/dist` as an unpacked extension in Chrome (`chrome://extensions` → Load unpacked)
2. Open `https://www.facebook.com/marketplace/telaviv/search/?query=ps5`
3. Open WorthIT popup — confirm "Scan All" button is visible, "Analyze Product" is hidden
4. Click "Scan All" — confirm status cycles through "Gathering…" → "Analyzing 1/5…" → … → "Done — top N deals"
5. Confirm result cards appear with rank, title, price, stars, and View links
6. Click a View link — confirm correct listing opens in a new tab
7. Open a listing item page — confirm "Analyze Product" button is shown, "Scan All" is hidden

- [ ] **Step 7: Commit**

```bash
cd /Users/shaishargal/worthIT && git add extension/src/popup/popup.html extension/src/popup/popup.css extension/src/popup/popup.ts && git commit -m "feat: wire Scan All button, scan flow, and result cards into popup"
```
