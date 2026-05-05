/* global chrome */
(function () {
  'use strict';

  var ENTRY = 'assets/worthit-main.js';

  // Minimal bridge: synchronous onMessage listener. Heavy logic lives in worthit-main.js (esbuild bundle).
  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || !msg.type) return false;
    if (msg.type === 'WORTHIT_PING') {
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'WORTHIT_SCORE') {
      import(/* @vite-ignore */ chrome.runtime.getURL(ENTRY))
        .then(function (mod) {
          return mod.runScore();
        })
        .catch(function (err) {
          console.error('[WorthIT] Failed to load scoring module:', err);
        });
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });
})();
