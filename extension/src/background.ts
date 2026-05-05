chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.storage.sync.get('apiBase').then((stored) => {
      if (!stored?.apiBase) {
        void chrome.storage.sync.set({ apiBase: 'http://localhost:4000' });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && typeof msg === 'object' && (msg as { type?: string }).type === 'WORTHIT_LOG') {
    console.log('[worthit]', (msg as { payload?: unknown }).payload);
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

export {};
