# Feature: Analyze Bulk

`POST /analyze-bulk` scores many listings scraped from the same page without re-fetching URLs. Unlike the earliest version, **each listing is evaluated against comparable prices for its own title** (passed to `getMarketData`), not one global median for the page search query.

Because the MVP `MARKET_DATA_PROVIDER` is often **`static`**, that provider uses coarse **keyword-based synthetic bands** (piano vs dock vs phone, etc.) plus a rough **ILS scale** so Israeli shekel listings are not compared to the same raw numbers as USD. Replace with a real provider for production accuracy.

## Request

```http
POST /analyze-bulk
Content-Type: application/json
```

```json
{
  "query": "optional page context string",
  "currency": "USD",
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

- `query` — optional string, ≤120 chars. Echoed in the response for UI context only; **not** used to fetch market data.
- `currency` — default comparison currency for rows that omit their own `currency`.
- `listings` — 1..60 items.
  - `title` — required.
  - `price` — positive finite number.
  - `currency` — optional per row (e.g. `ILS`, `USD`), normalized server-side (`NIS` → `ILS`).
  - `url`, `image` — optional URLs.

Rows whose title looks like Facebook UI noise (“posted just now”, `פורסמו … עכשיו`, etc.) are dropped **before** any provider or OpenAI calls.

## Response

```json
{
  "query": "…",
  "market": null,
  "results": [
    {
      "id": "facebook-YamahaClavinova-3",
      "title": "Yamaha Clavinova digital piano",
      "price": 700,
      "currency": "ILS",
      "source": "facebook",
      "url": "...",
      "comps": {
        "median": 17390,
        "mean": 17000,
        "min": 11840,
        "max": 20720,
        "sampleSize": 7
      },
      "score": 72,
      "verdict": "Fair",
      "breakdown": { "priceScore": 72, "conditionScore": 1 },
      "condition": { "label": "good", "signals": [] }
    }
  ]
}
```

- `market` — always `null` for this endpoint; use **`comps` on each result** for the comparable sample used in scoring.
- `results` sorted by **`score`** descending. Listings with no usable provider data are omitted.

## Pipeline (per surviving listing)

1. `getMarketData({ name: listing.title, currency })` → outlier cleanup → **`comps`** statistics.
2. `analyzeCondition` (bounded concurrency across listings).
3. `score(price, comps.median)` → `computeFinalScore` × condition → deterministic `finalVerdict`.
