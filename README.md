# WorthIT

AI-assisted Chrome extension that helps evaluate second-hand marketplace listings. The MVP analyzes **one product at a time**: extract listing data from Facebook Marketplace, compare to local market context, and show a deterministic verdict with AI reasoning.

## Quickstart

Terminal 1 — backend (default port **4000**):

```bash
cd backend
cp .env.example .env   # optional: OPENAI_API_KEY, MONGO_URI
npm install
npm run dev
```

Terminal 2 — Chrome extension:

```bash
cd extension
npm install
npm run build
```

Load unpacked from `extension/dist/` in `chrome://extensions`, open a Marketplace listing, and click **Analyze Product**.

## Docs

- [MVP architecture & API](docs/mvp.md)

## Project layout

```
WorthIT/
├── backend/src/     # Express API
├── extension/src/   # Chrome MV3 client
├── shared/          # Shared types & constants (no business logic)
└── docs/
```
