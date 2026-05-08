# WorthIT

AI-assisted second-hand deal checker focused on browser-assisted sourcing: extract listings from Marketplace pages via the extension, compare prices to market statistics, and get per-listing score and verdict.

## Quickstart

Terminal 1 — backend (default port **4000**):

```bash
cd backend
cp .env.example .env   # optional
npm install
npm run dev
```

Terminal 2 (optional) — Chrome extension:

```bash
cd extension
npm install
npm run build   # or `npm run dev` for watch mode
```

Then in Chrome go to `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select `extension/dist/`. With the backend running, navigate to a Facebook Marketplace search page and click the WorthIT action to see scored listings.

## Docs

- [Project setup](docs/project-setup.md)
- [Analyze bulk endpoint](docs/features/analyze-bulk.md)
- [Chrome extension](extension/README.md)
