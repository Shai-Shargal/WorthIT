# Feature: Analyze Bulk

`POST /analyze-bulk` evaluates many listings scraped from the same page in one call. Each
listing is evaluated against its **own** Israeli-market context built from `MarketObservation`
records — never a single global median for the page query.

When the observation store is empty (e.g. the MVP), `marketContext` falls back to the
`static-seed` provider in `services/marketData/providers/static.ts` so the AI still has *some*
price band to reason about. Replace with real Israeli sources for production accuracy.

## Request

```http
POST /analyze-bulk
Content-Type: application/json
```

```json
{
  "query": "optional page context string",
  "currency": "ILS",
  "listings": [
    {
      "title": "Yamaha Clavinova digital piano",
      "price": 700,
      "currency": "ILS",
      "url": "https://...",
      "image": "https://..."
    }
  ]
}
```

Schema (zod-validated):

- `query` — optional string, ≤120 chars. Echoed in the response for UI context only.
- `currency` — default comparison currency for rows that omit their own `currency`.
- `listings` — 1..60 items.
  - `title` — required.
  - `price` — positive finite number.
  - `currency` — optional per row (e.g. `ILS`, `USD`), normalized server-side (`NIS` → `ILS`).
  - `url`, `image` — optional URLs.

Rows whose title looks like Facebook UI noise ("posted just now", `פורסמו … עכשיו`, etc.) are
dropped **before** any market-context or AI calls.

## Response

```json
{
  "query": "…",
  "results": [
    {
      "listing": {
        "title": "Yamaha Clavinova digital piano",
        "price": 700,
        "currency": "ILS",
        "url": "…",
        "imageUrl": "…",
        "source": "facebook",
        "observedAt": "2026-01-15T00:00:00.000Z"
      },
      "localMarketContext": {
        "query": "Yamaha Clavinova digital piano",
        "currency": "ILS",
        "observationCount": 7,
        "priceRange": { "min": 11840, "max": 20720 },
        "typicalPrice": { "p25": 14500, "p50": 17390, "p75": 18900 },
        "recentObservations": [ "..." ],
        "notes": []
      },
      "historicalContext": {
        "query": "Yamaha Clavinova digital piano",
        "totalObservations": 0,
        "observations": []
      },
      "aiEvaluation": {
        "summary": "Asking price is far below the typical local band; verify condition before purchase.",
        "positives": ["Significantly below local p50"],
        "concerns": ["Few recent observations"],
        "recommendation": "worth_it",
        "confidence": 0.7,
        "estimatedValue": { "min": 11840, "max": 20720, "currency": "ILS" }
      }
    }
  ]
}
```

- Results are sorted by `recommendation` priority (`worth_it` → `maybe` → `avoid`), then by
  `confidence` descending.
- Listings with **no usable market context** (no recent and no historical observations) are
  omitted from `results`.
- The legacy `market: null` field has been removed. All per-listing market info now lives in
  `localMarketContext` and `historicalContext`.

## Pipeline (per surviving listing)

1. `buildMarketContexts({ name: title, currency })` → `LocalMarketContext` + `HistoricalContext`.
2. `analyzeCondition` (bounded concurrency) extracts condition signals from the title/image.
3. `evaluateListing` calls OpenAI (Israeli-market-aware prompt) and returns a zod-validated
   `AiEvaluation`. When no API key is configured a deterministic fallback runs with low
   confidence and a "AI disabled" note.
