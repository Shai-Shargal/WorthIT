import { getApiBase, analyzeProduct } from '../services/api.js';
import { isSearchPage, buildResultCard, resolveListingUrl } from './scanHelpers.js';
import { preScreen } from '../marketplace/preScreen.js';
import type { ObservedListing } from '../marketplace/types.js';
import type { AnalyzeProductResponse } from '../../../shared/types/index.js';

const analyzeBtn = document.getElementById('analyze') as HTMLButtonElement | null;
const scanBtn = document.getElementById('scan') as HTMLButtonElement | null;
const statusEl = document.getElementById('status') as HTMLParagraphElement | null;
const scanResults = document.getElementById('scan-results') as HTMLElement | null;
const apiBaseLabel = document.getElementById('api-base') as HTMLElement | null;

function setStatus(text: string, tone: 'info' | 'error' = 'info'): void {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.setAttribute('data-tone', tone);
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

async function getListingsFromTab(tabId: number): Promise<ObservedListing[]> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'WORTHIT_GET_LISTINGS' }, (response) => {
      if (chrome.runtime.lastError || !Array.isArray(response)) {
        resolve([]);
      } else {
        resolve(response as ObservedListing[]);
      }
    });
  });
}

function attachViewHandler(card: HTMLElement, url: string): void {
  card.querySelector('.scan-card__view')?.addEventListener('click', (e) => {
    e.preventDefault();
    void chrome.tabs.create({ url });
  });
}

async function runScan(tabId: number): Promise<void> {
  if (!scanBtn || !scanResults) return;

  scanBtn.disabled = true;
  scanResults.style.display = 'flex';
  scanResults.innerHTML = '';
  setStatus('Gathering listings…');

  const rawListings = await getListingsFromTab(tabId);
  const candidates = preScreen(rawListings);

  if (candidates.length === 0) {
    setStatus('No listings found on this page. Try scrolling first.', 'error');
    scanBtn.disabled = false;
    return;
  }

  const results: Array<{ listing: ObservedListing; analysis: AnalyzeProductResponse | null }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const listing = candidates[i];
    setStatus(`Analyzing ${i + 1}/${candidates.length}…`);

    let analysis: AnalyzeProductResponse | null = null;
    try {
      analysis = await analyzeProduct({
        title: listing.title,
        price: listing.price,
        currency: listing.currency,
        url: resolveListingUrl(listing.listingUrl),
      });
    } catch {
      // analysis stays null — card will show error placeholder
    }

    results.push({ listing, analysis });
    const card = buildResultCard(i + 1, listing, analysis);
    attachViewHandler(card, resolveListingUrl(listing.listingUrl));
    scanResults.appendChild(card);
  }

  // Re-sort by worthRating descending and re-render
  const sorted = [...results].sort(
    (a, b) =>
      (b.analysis?.verdict.worthRating ?? 0) - (a.analysis?.verdict.worthRating ?? 0),
  );
  scanResults.innerHTML = '';
  sorted.forEach((r, idx) => {
    const card = buildResultCard(idx + 1, r.listing, r.analysis);
    attachViewHandler(card, resolveListingUrl(r.listing.listingUrl));
    scanResults.appendChild(card);
  });

  setStatus(`Done — top ${sorted.length} deal${sorted.length !== 1 ? 's' : ''}`);
  scanBtn.textContent = 'Scan Again';
  scanBtn.disabled = false;
}

async function init(): Promise<void> {
  if (apiBaseLabel) {
    apiBaseLabel.textContent = await getApiBase();
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onMarketplace = isMarketplaceUrl(tab?.url);

  if (!onMarketplace) {
    if (analyzeBtn) analyzeBtn.disabled = true;
    setStatus('Open a Facebook Marketplace page first.');
    return;
  }

  if (isItemDetailPage(tab?.url)) {
    if (scanBtn) scanBtn.style.display = 'none';
    setStatus('Ready. Click Analyze Product.');

    analyzeBtn?.addEventListener('click', async () => {
      if (!tab?.id) return;
      analyzeBtn.disabled = true;
      setStatus('Loading…');
      try {
        await waitForContentScript(tab.id);
        await chrome.tabs.sendMessage(tab.id, { type: 'WORTHIT_ANALYZE' });
        window.close();
      } catch (err) {
        const raw = err instanceof Error ? err.message : 'Failed to message the page';
        const hint = raw.includes('Receiving end')
          ? ' Reload this Marketplace tab so the WorthIT bridge loads.'
          : '';
        setStatus(`${raw}.${hint}`, 'error');
        analyzeBtn.disabled = false;
      }
    });
  } else if (isSearchPage(tab?.url)) {
    if (analyzeBtn) analyzeBtn.style.display = 'none';
    if (scanBtn) scanBtn.style.display = '';
    setStatus('Scan visible listings for the best deals.');

    scanBtn?.addEventListener('click', () => {
      if (!tab?.id) return;
      void runScan(tab.id);
    });
  } else {
    if (analyzeBtn) analyzeBtn.disabled = true;
    setStatus('Open a specific listing to analyze it.');
  }
}

void init();
