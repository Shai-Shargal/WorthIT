(function () {
  'use strict';

  var ENTRY = 'assets/worthit-main.js';

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg.type === 'WORTHIT_PING') {
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'WORTHIT_ANALYZE') {
      import(chrome.runtime.getURL(ENTRY))
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
