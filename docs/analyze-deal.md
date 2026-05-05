# Feature: Analyze deal

## Goal

Accept raw listing text from the user, derive product + asking price, compare against comparable market prices, and return a score, verdict, and explanation.

## Non-goals (MVP)

- Scraping Facebook Marketplace or Yad2 (or any unreliable source).
- Fetching arbitrary URLs for link-only input (explicit `TODO` in parser).
- Authentication, quotas, subscriptions.
- Persisting analyses or caching market data in MongoDB (planned later).
- Production-grade LLM integration (stub template first; OpenAI wiring is `TODO`).

## API contract

### Request

`POST /analyze`

```json
{ "input": "string — pasted listing text" }
```

Validation: `input` must be a non-empty string after trim.

### Response (success)

```json
{
  "product": {
    "name": "string",
    "price": "number",
    "currency": "string (ISO-like code, e.g. USD)"
  },
  "market": {
    "median": "number",
    "mean": "number",
    "min": "number",
    "max": "number",
    "sampleSize": "number"
  },
  "score": "integer 0–100",
  "verdict": "Good | Fair | Bad",
  "explanation": "string"
}
```

### Errors

| Status | Meaning                                              |
| ------ | ---------------------------------------------------- |
| 400    | Invalid body, empty input, missing price, link-only |
| 503    | Not enough comparable prices after cleaning          |
| 500    | Unexpected server error                              |

## Pipeline stages

1. **Parse listing** (`services/parser.ts`)

   - Extract numeric price from free text (supports optional currency symbols / codes).
   - Finds every price-like token; uses the **last** match as the listing amount (typical: description ends with the asking price).
   - Comma-separated thousands must include at least one `,ddd` segment so values like `1500` are not truncated to `150`.
   - Derive product name by stripping that matched span from the input.
   - Links: reject with 400 until URL fetching is implemented.

2. **Market data** (`services/marketData/`)

   - Pluggable `MarketDataProvider` with `fetchComparablePrices({ name, currency }) → Promise<number[]>`.
   - Provider selected via `MARKET_DATA_PROVIDER` (default `static`).
   - Current `static` implementation is a **stub** returning fixed numbers; replace with real providers later (e.g. Yad2/Facebook via Playwright).

3. **Clean & aggregate** (`services/statistics.ts`)

   - Remove outliers via Tukey IQR (fences `Q1 - 1.5×IQR`, `Q3 + 1.5×IQR`).
   - If fewer than 4 samples, skip outlier removal (keep all).
   - Compute **median** (primary), mean, min, max, sample size.

4. **Score & verdict** (`services/scoring.ts`)

   - Raw ratio: `(median - price) / median`, clamped to `[-1, 1]`.
   - Map to score: `(ratio + 1) × 50`, rounded, clamped to `[0, 100]`.
     - Interpretation: **50 ≈ at median**; higher = cheaper vs market; lower = more expensive.
   - Verdict thresholds (on integer score):
     - **Good**: score ≥ 65
     - **Fair**: 45 ≤ score < 65
     - **Bad**: score < 45
   - If `median ≤ 0` or non-finite: return `{ score: 50, verdict: 'Fair' }` (defensive).

5. **Explanation** (`services/explanation.ts`)

   - MVP: deterministic paragraph from context (price vs median, range, verdict).
   - Future: LLM using `LLM_API_KEY` (`TODO`).

## Extension points

- Add a provider under `backend/src/services/marketData/providers/` and register it in `services/marketData/index.ts`.
- Keep HTTP handler thin: validation + orchestration only in `routes/analyze.ts`.

## Frontend

- `POST /analyze` via dev proxy to backend (`vite.config.ts`).
- Display product, price, median, score, verdict, explanation.
