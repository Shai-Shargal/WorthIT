import { getApiBase } from '../services/api.js';

const button = document.getElementById('analyze') as HTMLButtonElement | null;
const status = document.getElementById('status') as HTMLParagraphElement | null;
const apiBaseLabel = document.getElementById('api-base') as HTMLElement | null;

function setStatus(text: string, tone: 'info' | 'error' = 'info'): void {
  if (!status) return;
  status.textContent = text;
  status.setAttribute('data-tone', tone);
}

async function waitForContentScript(tabId: number): Promise<void> {
  let last: unknown;
  for (let i = 0; i < 10; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'WORTHIT_PING' });
      return;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw last instanceof Error ? last : new Error('Content script unreachable');
}

function isMarketplaceUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.endsWith('facebook.com') && u.pathname.startsWith('/marketplace');
  } catch {
    return false;
  }
}

function isItemDetailPage(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.endsWith('facebook.com') && u.pathname.includes('/marketplace/item/');
  } catch {
    return false;
  }
}

async function init(): Promise<void> {
  if (apiBaseLabel) {
    apiBaseLabel.textContent = await getApiBase();
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onMarketplace = isMarketplaceUrl(tab?.url);

  if (!button) return;

  if (!onMarketplace) {
    button.disabled = true;
    setStatus('Open a Facebook Marketplace page first.');
    return;
  }

  if (isItemDetailPage(tab?.url)) {
    setStatus('Ready. Click Analyze Product.');
  } else {
    setStatus('Click Analyze, then pick a listing.');
  }

  button.addEventListener('click', async () => {
    if (!tab?.id) return;
    button.disabled = true;
    setStatus('Loading…');
    try {
      await waitForContentScript(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: 'WORTHIT_ANALYZE' });
      window.close();
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to message the page';
      const hint =
        raw.includes('Receiving end')
          ? ' Reload this Marketplace tab so the WorthIT bridge loads.'
          : '';
      setStatus(`${raw}.${hint}`, 'error');
      button.disabled = false;
    }
  });
}

void init();
