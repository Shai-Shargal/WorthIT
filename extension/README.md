# WorthIT Chrome Extension

Analyzes a single Facebook Marketplace listing via the WorthIT backend (`POST /analyze-product`) and shows a floating result panel.

## Build

```bash
npm install
npm run build
```

Load `extension/dist/` as an unpacked extension in Chrome.

## Configuration

Default API base: `http://localhost:4000`. Override from the service worker console:

```js
chrome.storage.sync.set({ apiBase: 'http://localhost:4000' });
```
