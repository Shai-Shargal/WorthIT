(function () {
  'use strict';

  var ANALYZE_ENTRY = 'assets/worthit-main.js';
  var PASSIVE_ENTRY = 'assets/worthit-passive.js';

  // Start passive collection on browse pages (not item detail pages)
  if (!location.pathname.includes('/marketplace/item/')) {
    import(chrome.runtime.getURL(PASSIVE_ENTRY)).catch(function (err) {
      console.warn('[WorthIT] Passive collection failed to load:', err);
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg.type === 'WORTHIT_PING') {
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'WORTHIT_ANALYZE') {
      import(chrome.runtime.getURL(ANALYZE_ENTRY))
        .then(function (mod) {
          return mod.runAnalyze();
        })
        .then(function () {
          sendResponse({ ok: true });
        })
        .catch(function (err) {
          console.error('[WorthIT] Failed to load analyze module:', err);
          sendResponse({ ok: false, error: String(err) });
        });
      return true;
    }
    return false;
  });
})();
