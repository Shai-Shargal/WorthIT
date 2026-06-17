# WorthIT — AI-Powered Price Pipeline Design

**Date:** 2026-06-17
**Status:** Approved

## Problem

The current system uses a static seed (`static.ts`) with 7 keyword categories as the market data fallback. Any product that doesn't match a keyword gets the default phone price band (p50 ≈ ₪7,030), producing wrong verdicts — a ₪555 capsule and a ₪4,200 Stratocaster both score "WORTH IT 5/5". The verdict is computed by a deterministic formula that has no understanding of what the product actually is.

## Goal

Replace the static seed + deterministic formula with a two-stage pipeline:
1. **Price Gathering** — find real market prices (MongoDB DB first, Tavily web search if insufficient)
2. **AI Analysis** — AI receives all gathered data and decides the full verdict + reasoning

AI owns the verdict. The deterministic formula is removed.

## Architecture

```
ProductInput
  └─► [Cache check] — if hit, return cached response

  └─► Stage 1: Price Gathering  (priceGathering.ts)
        ├─ MongoDB: findSimilarObservations (last 90 days)
        ├─ if observations < 5:
        │     └─ Tavily search (Hebrew + English queries)
        │           └─ extract prices → save to MongoDB as MarketObservation[]
        └─ returns: { observations: MarketObservation[], sources: ('db' | 'tavily')[] }

  └─► Stage 2: AI Analysis  (ai/aiAnalysis.ts)
        ├─ condition.ts — product condition (unchanged)
        ├─ single OpenAI structured prompt:
        │     listing + condition + observations + sources → JSON verdict + reasoning
        └─ returns: { verdict: VerdictResult, reasoning: AiReasoning }

  └─► AnalyzeProductResponse (same shape as today)
        → cache + save to MongoDB + record observation
```

## Stage 1: Price Gathering

### File: `backend/src/marketplace/priceGathering.ts`

```typescript
interface PriceGatheringResult {
  observations: MarketObservation[];
  sources: ('db' | 'tavily')[];
}

async function gatherPrices(query: { name: string; currency: string }): Promise<PriceGatheringResult>
```

**Logic:**
1. Query MongoDB for similar observations (last 90 days, limit 30) — existing `findSimilarObservations`
2. If `observations.length < 5` → call Tavily provider
3. Append Tavily results to observation list
4. Return combined observations + sources used

### File: `backend/src/marketplace/providers/tavily.ts`

**Tavily integration:**
- Endpoint: `https://api.tavily.com/search`
- Config: `search_depth: "advanced"`, `include_answer: true`, `max_results: 5`
- Two queries per product:
  - `"{product name}" יד שנייה מחיר`
  - `"{product name}" second hand price Israel`
- Price extraction: regex matching `₪NNN`, `NNN ש"ח`, `NNN ILS` patterns from result snippets
- Each extracted price → one `MarketObservation` saved to MongoDB with `source: 'tavily'`
- Graceful failure: API errors return empty array, pipeline continues without Tavily data

**Env var:** `TAVILY_API_KEY`

**Threshold:** `< 5` real observations triggers Tavily. Once the DB has 5+ real observations for a product, Tavily is never called again for that product — the DB grows itself.

## Stage 2: AI Analysis

### File: `backend/src/ai/aiAnalysis.ts`

Replaces `verdict.ts` (deleted) and `generateNarrative` (replaced).

**System prompt instructs AI to:**
- Act as a deal analyst for the Israeli second-hand market
- Evaluate the listing against gathered market prices
- Return structured JSON only — no commentary

**AI receives:**
- Listing: title, asking price, currency, description
- Condition: conditionLabel + signals (from existing `condition.ts`)
- Market observations: up to 15 most recent, with source + date + price
- Sources used: `db` / `tavily` (informs confidence)
- Confidence guidance:
  - `low`: fewer than 3 observations or all from Tavily only
  - `medium`: 3–9 observations or mixed sources
  - `high`: 10+ real DB observations

**AI returns (JSON schema):**
```json
{
  "verdict": "worth_it" | "maybe" | "avoid",
  "worthRating": 1-5,
  "confidence": 0.0-1.0,
  "confidenceLevel": "low" | "medium" | "high",
  "summary": "1-2 plain sentences, friend tone",
  "positives": ["...", "..."],
  "concerns": ["...", "..."]
}
```

Validated with Zod before use.

**Fallback:** If OpenAI call fails → return `maybe` verdict, `low` confidence, fallback reasoning text. Pipeline never throws.

## What Changes

| File | Action |
|---|---|
| `backend/src/marketplace/priceGathering.ts` | **New** — Stage 1 orchestrator |
| `backend/src/marketplace/providers/tavily.ts` | **New** — Tavily provider |
| `backend/src/ai/aiAnalysis.ts` | **New** — combined verdict + reasoning |
| `backend/src/analysis/run.ts` | **Modify** — call Stage 1 then Stage 2 |
| `backend/src/marketplace/marketContext.ts` | **Delete** — replaced by priceGathering.ts entirely |
| `backend/src/analysis/verdict.ts` | **Delete** — replaced by AI |
| `backend/src/ai/narrative.ts` | **Delete** — merged into aiAnalysis.ts |
| `backend/src/marketplace/providers/static.ts` | **Delete** — no longer primary source |
| `backend/src/marketplace/seed.ts` | **Delete** — no longer needed |
| `backend/.env.example` | **Modify** — add `TAVILY_API_KEY` |

## What Stays Unchanged

- `shared/types/analysis.ts` — `VerdictResult` and `AiReasoning` shape unchanged
- `shared/types/market.ts` — `MarketObservation` unchanged
- Extension code — zero changes needed
- `analysisCache.ts` — in-memory cache unchanged
- `analysisRepository.ts` — MongoDB persistence unchanged
- `condition.ts` — condition analysis unchanged
- All existing routes unchanged

## Future Extension Points

Adding Amazon, eBay, or Yad2 as price sources = add a new provider file + call it in `priceGathering.ts`. No other changes needed. Each provider follows the same interface:

```typescript
interface PriceProvider {
  id: string;
  search(query: { name: string; currency: string }): Promise<MarketObservation[]>;
}
```

## Testing Strategy

- `priceGathering.test.ts` — mock MongoDB + mock Tavily; verify threshold logic and DB save
- `tavily.test.ts` — mock HTTP; verify price extraction regex, graceful failure
- `aiAnalysis.test.ts` — mock OpenAI; verify Zod validation, fallback on error
- `run.test.ts` — integration test with all dependencies mocked; verify full pipeline output shape
- Existing tests for routes, auth, usage — unchanged
