# Batch Scan Feature — Design Spec

**Date:** 2026-06-28
**Status:** Approved

---

## Overview

When a user is on a Facebook Marketplace search results page (e.g. `/marketplace/telaviv/search/?query=ps5`), they can click a **"Scan All"** button in the WorthIT popup. The extension collects all visible listing cards, pre-screens them cheaply, runs the full AI analysis on the top 5 candidates, and displays a live-updating ranked list of the best deals.

---

## Goals

- Surface the best deals from a search results page without requiring the user to click into each listing individually
- Reuse the existing `/analysis/analyze` endpoint — no backend changes
- Keep total scan time under 30 seconds for 5 listings
- Show results progressively so the popup feels alive during the wait

## Non-Goals

- Scanning across multiple pages (infinite scroll is not triggered automatically)
- Server-side pre-screening using DB market data (future improvement)
- Injecting badges onto the Facebook page itself
- Handling non-Facebook marketplaces

---

## Components

### New: `extension/src/marketplace/preScreen.ts`

Pure module, no DOM, no API calls. Two exports:

**`hasRedFlag(title: string): boolean`**
Returns true if the title matches any of the following patterns (case-insensitive, bilingual):

| Flag | Patterns |
|------|----------|
| As-is | `as.?is`, `כפי שהוא` |
| Untested | `untested`, `לא בדוק` |
| Urgent sale | `חייב למכור`, `urgent` |
| No charger | `ללא מטען`, `no charger` |
| One controller | `שלט אחד`, `one controller` |
| Vague title | `כנסו לתיאור` |

**`preScreen(listings: ObservedListing[], topN?: number): ObservedListing[]`**
- Splits listings into clean (no red flag) and flagged buckets
- Sorts each bucket by price ascending
- Returns clean listings first, then flagged, truncated to `topN` (default: 5)
- Never returns fewer than `min(listings.length, topN)` — if everything is flagged, still returns the cheapest flagged ones

### Modified: `extension/src/popup/popup.ts`

Extend the existing popup init logic:

- Add `isSearchPage(url)` detection (URL contains `/marketplace/` and `?query=`)
- When on a search page: show "Scan All" button, hide the existing "Analyze Product" button
- Add `runScan()` async function (see Data Flow below)
- Add `appendResultCard(rank, listing, analysis | null)` to build result cards progressively

### Modified: `extension/popup.html`

- Add a `#scan-results` container (hidden by default, shown during/after scan)
- Add `#scan-btn` button (shown only on search pages)
- Increase popup `min-height` to accommodate up to 5 result cards

### No backend changes

The existing `POST /analysis/analyze` endpoint is used without modification. The existing 1-hour in-memory cache means repeated scans of the same listings are effectively free.

---

## Data Flow

```
1. User on /marketplace/.../search/?query=X
2. Opens WorthIT popup
3. popup.ts detects search page → shows "Scan All" button
4. User clicks "Scan All"
5. popup.ts sends WORTHIT_GET_LISTINGS to content script
6. Content script calls extractListingsFromSearchPage() → returns ObservedListing[]
7. popup.ts calls preScreen(listings, { topN: 5 })
   → filters red flags to back → sort by price → top 5 candidates
8. For each candidate (sequential):
   a. Update status: "Analyzing 2/5…"
   b. POST /analysis/analyze { title, price, currency, url, description: undefined }
   c. On success: appendResultCard(rank, listing, analysis)
   d. On failure: appendResultCard(rank, listing, null) — shows error placeholder
9. After all 5: sort cards by worthRating descending, show "Done"
10. "Scan All" button re-enables as "Scan Again"
```

### New message type

```ts
// Request (popup → content script)
{ type: 'WORTHIT_GET_LISTINGS' }

// Response (content script → popup)
ObservedListing[]
```

Follows the existing `WORTHIT_PING` / `WORTHIT_ANALYZE` pattern in `background.ts`.

---

## UI States

### Idle (search page, not scanning)
```
[WorthIT]
Scan visible listings for the best deals.
[ Scan All ]
```

### Scanning
```
[WorthIT]
Analyzing 2/5…

#1  MacBook Pro M2 2022       ₪4,200
    ★★★★★                      [View →]

#2  MacBook Air M1 256GB      ₪3,800
    ★★★★☆  (loading...)
```

### Done
```
[WorthIT]
Done — top 5 deals

#1  MacBook Pro M2 2022       ₪4,200
    ★★★★★                      [View →]

#2  MacBook Air M1 256GB      ₪3,800
    ★★★★☆                      [View →]

...

[ Scan Again ]
```

### Result card anatomy
- Rank badge (`#1`, `#2`, …)
- Title truncated to 35 characters
- Price in ILS (e.g. `₪4,200`)
- Star rating (1–5 stars, derived from `verdict.worthRating`)
- "View →" button that opens the listing URL in a new tab via `chrome.tabs.create`; `listingUrl` may be relative — popup must prepend `https://www.facebook.com` if the URL does not start with `http`
- On failure: `⚠ Could not analyze` in place of stars, View button still shown

---

## Pre-Screen Logic

```ts
// Pseudocode
function preScreen(listings, topN = 5) {
  const clean = listings.filter(l => !hasRedFlag(l.title));
  const flagged = listings.filter(l => hasRedFlag(l.title));
  const sorted = [
    ...clean.sort((a, b) => a.price - b.price),
    ...flagged.sort((a, b) => a.price - b.price),
  ];
  return sorted.slice(0, topN);
}
```

The "clean first, flagged last" approach means red-flag listings are still analyzed if there aren't enough clean ones — the user always gets results.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No listings extracted from DOM | Show "No listings found on this page. Try scrolling first." |
| All 5 analyses fail | Show all 5 as `⚠ Could not analyze`; don't show a generic error |
| One analysis fails | Skip it, continue, show placeholder for that card |
| Content script unreachable | Reuse existing `waitForContentScript` check; show existing reload hint |
| Fewer than 5 listings visible | Scan all available (e.g. 3 listings → 3 result cards) |

---

## Testing Plan

### Unit tests — `preScreen.ts`

- All clean listings sorted by price ascending
- Red-flagged listings sorted to back
- Mix of clean and flagged — clean come first
- Fewer than 5 listings — returns all
- All listings flagged — returns cheapest flagged ones (no empty result)
- Empty input — returns empty array
- `hasRedFlag` — each pattern triggers correctly (Hebrew + English)

### Integration tests — popup scan flow (chrome message mocks)

- Happy path: 5 analyses succeed → 5 cards sorted by rating
- Partial failure: 1 of 5 analyses fails → 4 cards + 1 placeholder
- Zero listings extracted → error message shown
- Content script unreachable → shows reload hint

---

## Risk Analysis

- **Facebook DOM changes** — `extractListingsFromSearchPage` already has fallback selectors; new feature inherits this fragility. Mitigation: the feature degrades gracefully (shows "No listings found").
- **Rate limiting** — 5 sequential `/analyze` calls in ~25s is well within current limits. Not a concern for MVP.
- **Popup height** — Chrome limits popup height to 600px. 5 cards + header needs ~500px. Should fit; verify during implementation.
- **Pre-screen misses** — Red flag patterns are title-only. A broken item with no flags in the title will pass through. Acceptable for MVP; full AI analysis will catch it.
