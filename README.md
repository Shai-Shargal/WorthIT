# WorthIT

AI-assisted second-hand deal checker: paste listing text, compare the asking price to market statistics, get a score and verdict.

## Quickstart

Terminal 1 — backend (default port **4000**):

```bash
cd backend
cp .env.example .env   # optional
npm install
npm run dev
```

Terminal 2 — frontend:

```bash
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`). The UI proxies `/analyze`, `/search`, and `/health` to the backend.

Terminal 3 (optional) — Chrome extension:

```bash
cd extension
npm install
npm run build   # or `npm run dev` for watch mode
```

Then in Chrome go to `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select `extension/dist/`. With the backend running, navigate to a Facebook Marketplace search page and click the WorthIT action to see scored listings.

## Docs

- [Project setup](docs/project-setup.md)
- [Analyze deal feature](docs/features/analyze-deal.md)
- [Analyze bulk endpoint](docs/features/analyze-bulk.md)
- [Chrome extension](extension/README.md)
