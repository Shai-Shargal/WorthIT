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

Open the URL printed by Vite (usually `http://localhost:5173`). The UI proxies `/analyze` and `/health` to the backend.

## Docs

- [Project setup](docs/project-setup.md)
- [Analyze deal feature](docs/features/analyze-deal.md)
