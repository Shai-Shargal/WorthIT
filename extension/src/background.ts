import { DEFAULT_API_BASE } from '../../shared/constants/index.js';

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.sync.get(['apiBase']).then((stored) => {
    if (!stored.apiBase) {
      return chrome.storage.sync.set({ apiBase: DEFAULT_API_BASE });
    }
  });
});
