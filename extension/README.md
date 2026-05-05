# WorthIT Chrome Extension

Score Facebook Marketplace listings against market data, in-place. The extension extracts visible listings from the page, sends them to the WorthIT backend (`POST /analyze-bulk`), and renders a floating overlay with each listing's score and verdict.

## Develop

```bash
cd extension
npm install
npm run dev   # vite build --watch -> extension/dist
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked** and select `extension/dist`.

## Build

```bash
npm run build
```

Outputs a production bundle in `extension/dist/`.

## Backend

The extension expects the WorthIT backend running on `http://localhost:4000` by default. To point it elsewhere, run this from the extension's service-worker DevTools console:

```js
chrome.storage.sync.set({ apiBase: 'https://your-host:4000' });
```

## Usage

1. Visit `https://www.facebook.com/marketplace/search?query=iphone+13` (or any Marketplace search/feed page).
2. Click the WorthIT extension icon.
3. Click **Score this page**.
4. A floating panel appears top-right with each visible listing's score, verdict (color-coded), and a link out to the listing.

The button is disabled on non-Marketplace tabs.

## Troubleshooting

**"Could not establish connection. Receiving end does not exist."**

Usually the content script has not loaded on that tab yet. After rebuilding or reloading the unpacked extension at `chrome://extensions`, **hard-refresh** the Marketplace tab (`Cmd+Shift+R` / `Ctrl+Shift+R`) and try again. The popup also waits briefly for the receiver before failing.

URLs must stay on Marketplace paths (`facebook.com/marketplace/...`, `www` or apex). If you pinned an old unpacked folder, reload the extension from **`extension/dist/`** after `npm run build`.
