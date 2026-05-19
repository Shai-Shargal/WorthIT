# WorthIT MVP — Single Product Analysis

## Flow

1. User opens a Facebook Marketplace listing (item page or visible card).
2. User clicks **Analyze Product** in the extension popup.
3. Extension extracts normalized product data from the DOM.
4. Backend `POST /analyze-product` receives the payload.
5. Backend checks the in-memory analysis cache (1h TTL).
6. If no cache hit:
   - Build local + historical market context (Mongo observations or static seed).
   - Compute a **deterministic verdict** (price vs local p50 band).
   - Generate **AI reasoning** (summary, positives, concerns) that explains the verdict.
7. Response includes worth rating, verdict, confidence level, and reasoning.
8. Extension shows a single-result overlay.

## API

### `POST /analyze-product`

```json
{
  "title": "iPhone 13 128GB",
  "price": 1500,
  "currency": "ILS",
  "description": "optional",
  "url": "https://...",
  "image": "https://..."
}
```

### Response

```json
{
  "listing": { "title": "...", "price": 1500, "currency": "ILS" },
  "localMarketContext": { "..." : "..." },
  "historicalContext": { "..." : "..." },
  "verdict": {
    "verdict": "worth_it",
    "worthRating": 5,
    "confidence": 0.72,
    "confidenceLevel": "high",
    "estimatedValue": { "min": 1800, "max": 2400, "currency": "ILS" }
  },
  "reasoning": {
    "summary": "...",
    "positives": ["..."],
    "concerns": ["..."]
  }
}
```

## Architecture

```
WorthIT/
├── backend/src/
│   ├── main.ts
│   ├── app.ts
│   ├── analysis/    # run, verdict, analyzeProduct.route
│   ├── ai/
│   ├── cache/
│   ├── database/
│   ├── marketplace/
│   ├── auth/        # stub
│   └── usage/       # stub
├── extension/src/
│   ├── popup/
│   ├── content/     # bridge, extractor, analyze-runtime, overlay
│   ├── services/    # api client
│   └── utils/
├── shared/
│   ├── types/
│   └── constants/
└── docs/
```

## Principles

- **Verdict is deterministic** — computed from market statistics, not the LLM.
- **AI supports reasoning** — explains the verdict; does not override it.
- **Mongo is optional** — MVP works without `MONGO_URI`; static seed fills gaps.
- **Shared is types/constants only** — no business logic in `shared/`.
