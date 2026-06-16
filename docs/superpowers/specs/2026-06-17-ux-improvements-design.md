# WorthIT UX Improvements — Design Spec

## Goal

Fix four problems discovered during real usage testing:
1. Wrong product title extracted on item detail pages
2. No way to pick which listing to analyze on browse pages
3. Verdict explanation is too technical for regular users
4. Confidence score is misleading when data is synthetic/thin

---

## Part 1 — Title Extraction Fix

**Problem:** On Facebook Marketplace item pages (`/marketplace/item/...`), `document.querySelector('h1')` grabs Facebook's own site heading ("Marketplace") instead of the product name.

**Fix:** In `extension/src/content/extractor.ts`, change the title lookup to search within `[role="main"]` first:

```
1. document.querySelector('[role="main"] h1')
2. document.querySelector('[role="main"] [data-ad-comet-preview="message"]') // FB listing title attr
3. Fallback: scan text lines in [role="main"], pick first non-price non-UI line
```

The `isLikelyFbUiTitle` filter already catches short/pattern-matched strings — keep it. The fix is narrowing the `h1` selector to the main content area, not the global page.

---

## Part 2 — Click-to-Select Mode

**Problem:** On browse/search pages the extractor picks the first visible anchor in DOM order. The user has no way to choose which product they want analyzed.

**Behaviour:**

- **On an item detail page** (`/marketplace/item/...`): "Analyze Product" button works as before — extracts the current listing and analyzes it immediately.
- **On a browse/search page** (any other `/marketplace/` path): clicking "Analyze Product" enters **selection mode**:
  1. A semi-transparent dark overlay covers the page (opacity 0.35, `pointer-events: none` on the overlay itself so cards remain clickable)
  2. Product card anchors (`a[href*="/marketplace/item/"]`) get a green highlight border on hover
  3. Clicking a card: removes the selection UI, extracts that card's data, runs the analysis
  4. Pressing `Escape`: exits selection mode with no analysis
  5. The popup closes immediately after triggering selection mode (normal Chrome behaviour)

**Popup hint text:**
- Item detail page → *"Ready. Click Analyze Product."*
- Browse page → *"Click Analyze, then pick a listing."*
- Non-marketplace page → *"Open a Facebook Marketplace listing first."* (button disabled)

**New file:** `extension/src/content/selection.ts`
- `enterSelectionMode(): Promise<ProductInput | null>` — mounts the dim overlay, adds hover listeners, returns the clicked product or null on Escape
- `exitSelectionMode(): void` — cleans up the overlay and listeners

**Modified files:**
- `extension/src/content/analyze-runtime.ts` — detect page type, call `enterSelectionMode()` on browse pages or `extractActiveListing()` on item pages
- `extension/src/popup/popup.ts` — update hint text based on page type (item vs browse vs other)

---

## Part 3 — Plain-Language Verdict

**Problem:** The AI explanation uses developer jargon ("deterministic verdict", "p50≈17020", "local band") that regular users don't understand. The fallback narrative (used when OpenAI is unavailable) is also jargon-heavy.

**Fix — AI system prompt** in `backend/src/ai/narrative.ts`:

Replace current system prompt with:
```
You are a helpful friend advising someone on a second-hand marketplace deal in Israel.
Speak in plain, direct language — like a knowledgeable friend, not a data analyst.

Rules:
- NEVER use the words: deterministic, p50, local band, observation, ILS, confidence score.
- Open with one sentence saying what the price means (cheap, fair, or expensive vs similar items).
- Then 2–3 short bullet points: reasons it's a good deal OR things to watch out for.
- Keep it under 60 words total.
- Match your tone to the verdict: enthusiastic for worth_it, cautious for maybe, direct for avoid.
- Output JSON only: { "summary": string, "positives": string[], "concerns": string[] }
```

**Fix — fallback narrative** in `backend/src/ai/narrative.ts` (`fallbackNarrative` function):

Replace jargon template with plain language using the same data:
- `worth_it`: *"At [price], this is well below what similar items typically sell for ([p50]). Looks like a solid deal."*
- `avoid`: *"At [price], this is above the going rate for similar items ([p50]). You can likely find better."*
- `maybe`: *"At [price], this is roughly in line with similar items. Not a standout deal, but not overpriced either."*
- Low data: append *" (Based on limited listings — take this with a grain of salt.)"*

---

## Part 4 — Honest Data Quality

**Problem:** When observations come from synthetic seed data (no real MongoDB sales), the confidence formula still reaches 85%. Users see "Confidence 85%" on data that is entirely estimated.

**Confidence cap by data quality** in `backend/src/analysis/verdict.ts`:

`computeVerdict` already receives `localMarketContext`. After computing the raw confidence score, apply a cap based on `localMarketContext.dataQuality`:

| `dataQuality` | Max confidence |
|---|---|
| `'seed'` (synthetic data, 0 real observations) | 30% |
| `'insufficient'` (1–4 real observations) | 50% |
| `'real'` (5+ real observations) | 85% (current max) |

**Data quality flag** — add a new field to `LocalMarketContext` in `shared/types/market.ts`:
```typescript
dataQuality: 'real' | 'seed' | 'insufficient'
```

Set in `backend/src/marketplace/marketContext.ts`:
- `'seed'` when falling back to static provider
- `'insufficient'` when fewer than 5 real observations
- `'real'` when 5+ real observations

**Overlay warning banner** in `extension/src/content/overlay.ts`:
- `dataQuality === 'seed'`: yellow banner — *"Estimated prices — no local sales data yet"*
- `dataQuality === 'insufficient'`: yellow banner — *"Limited data — fewer than 5 local sales found"*
- `dataQuality === 'real'`: no banner

**AI narrative instruction** — when `dataQuality !== 'real'`, append to the user prompt:
> "Data quality is low. Explicitly tell the user we don't have enough real local listings and they should verify independently."

---

## Files Changed

| File | Change |
|---|---|
| `extension/src/content/extractor.ts` | Narrow h1 selector to `[role="main"]` |
| `extension/src/content/selection.ts` | New — click-to-select mode |
| `extension/src/content/analyze-runtime.ts` | Detect page type, dispatch to selection or direct |
| `extension/src/popup/popup.ts` | Contextual hint text |
| `backend/src/ai/narrative.ts` | New system prompt + plain fallback narrative |
| `backend/src/analysis/verdict.ts` | Confidence caps by observation count |
| `backend/src/marketplace/marketContext.ts` | Set `dataQuality` flag |
| `shared/types/market.ts` | Add `dataQuality` field to `LocalMarketContext` |
| `extension/src/content/overlay.ts` | Data quality warning banner |

---

## What This Does NOT Change

- The deterministic verdict logic (price vs p50 band) — stays as-is
- The backend API shape — `dataQuality` is added to `LocalMarketContext` which is already in the response
- The overlay position (stays top-right, fixed)
- Auth, usage tracking, or any other backend features
