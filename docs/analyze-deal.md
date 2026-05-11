# Feature: Analyze deal

## Goal

Accept raw listing text from the user, derive product + asking price, build structured Israeli
second-hand market context from historical observations, and return an AI-generated evaluation
with summary, positives, concerns, recommendation, and confidence.

WorthIT does **not** assert a single "true price". It reasons over evolving local observations and
communicates uncertainty.

## Non-goals

- Hardcoded `score` / `verdict` math (removed in this refactor).
- Scraping Facebook Marketplace or Yad2 inside `/analyze` (handled by `/search`).
- Fetching arbitrary URLs for link-only input (explicit `TODO` in parser).
- Authentication, quotas, subscriptions.

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
  "listing": {
    "title": "string",
    "price": 1500,
    "currency": "ILS",
    "description": "raw listing text",
    "source": "manual",
    "observedAt": "2026-01-15T00:00:00.000Z"
  },
  "localMarketContext": {
    "query": "iPhone 13",
    "currency": "ILS",
    "observationCount": 7,
    "priceRange": { "min": 1800, "max": 2400 },
    "typicalPrice": { "p25": 1900, "p50": 2050, "p75": 2200 },
    "recentObservations": [
      {
        "productName": "iPhone 13 128GB",
        "observedPrice": 2000,
        "currency": "ILS",
        "source": "yad2",
        "timestamp": "2026-01-08T00:00:00.000Z"
      }
    ],
    "notes": []
  },
  "historicalContext": {
    "query": "iPhone 13",
    "totalObservations": 12,
    "oldestTimestamp": "2025-04-01T00:00:00.000Z",
    "newestTimestamp": "2025-10-12T00:00:00.000Z",
    "observations": [ "..." ]
  },
  "aiEvaluation": {
    "summary": "Listing sits slightly below the typical Israeli market band; confidence is medium.",
    "positives": ["Below local p50", "Recent comparable listings exist"],
    "concerns": ["Few recent observations"],
    "recommendation": "worth_it",
    "confidence": 0.62,
    "estimatedValue": { "min": 1800, "max": 2300, "currency": "ILS" }
  }
}
```

### Errors

| Status | Meaning                                              |
| ------ | ---------------------------------------------------- |
| 400    | Invalid body, empty input, missing price, link-only  |
| 500    | Unexpected server error                              |

Note: there is no more `503` for "not enough data". When the observation store is empty the
backend falls back to a synthetic seed provider and the AI evaluator reports low confidence.

## Pipeline stages

1. **Parse listing** (`services/parser.ts`) — extract title, price, currency from free text.

2. **Build market contexts** (`services/marketContext.ts`)
   - Recent window (≤90d) → `LocalMarketContext` (count, IQR-cleaned price range, `p25/p50/p75`).
   - Older window → `HistoricalContext` with oldest/newest timestamps.
   - Falls back to the seed provider in `services/marketData/providers/static.ts` when no
     observations are stored (dev-friendly default).

3. **Condition signals** (`services/condition.ts`) — extracted from the title/description and
   passed as one of many AI inputs (no more `conditionScore` math).

4. **AI evaluation** (`services/aiEvaluation.ts`)
   - Calls OpenAI with an Israeli-market-aware system prompt.
   - Validates the response with `zod` and clamps `confidence` to `[0, 1]`.
   - Deterministic fallback when `OPENAI_API_KEY` / `LLM_API_KEY` is not configured.

## Philosophy

- Markets shift; prices drift; listings disappear. We model observations, not "the price".
- AI does the reasoning. The backend only provides clean, structured context.
- Communicate uncertainty naturally — every response carries a `confidence` and may omit
  `estimatedValue` when context is too thin.

## Extension points

- Add a new market data provider under `backend/src/services/marketData/providers/` and register
  it in `services/marketData/index.ts`.
- Real Israeli sources (Yad2, Facebook Marketplace IL, Telegram crawlers) should write
  `MarketObservation` rows via `services/marketObservations.ts.recordObservations`.
- The `MarketObservation` Mongo collection is the long-term market memory of the system.

## Frontend

- The Chrome extension renders the new `aiEvaluation` (recommendation badge, summary,
  positives/concerns, confidence bar, estimated value range). See
  `extension/src/overlay.ts`.
