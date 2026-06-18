import { extractFromAnchor, extractActiveListing, fallbackCurrencyFromPage } from './extractor.js';
import { getApiBase } from '../services/api.js';

if (location.pathname.includes('/marketplace/item/')) {
  // Item detail page — silently save full listing (with description) once it's loaded
  silentlySaveItemListing();
} else {
  // Browse/category page — passively collect all visible listing cards
  startPassiveCollection();
}

async function silentlySaveItemListing(): Promise<void> {
  // Wait for Facebook's client-side render to finish
  await new Promise((resolve) => setTimeout(resolve, 2_000));

  const listing = extractActiveListing();
  if (!listing) return;

  const description =
    document
      .querySelector('meta[property="og:description"]')
      ?.getAttribute('content')
      ?.trim() || undefined;

  try {
    const base = await getApiBase();
    await fetch(`${base.replace(/\/$/, '')}/marketplace/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        observations: [{
          name: listing.title,
          price: listing.price,
          currency: listing.currency,
          description,
          url: listing.url,
        }],
      }),
    });
    console.debug(`[WorthIT] Saved item listing: ${listing.title}`);
  } catch {
    // Silent fail
  }
}

type ObservationPayload = { name: string; price: number; currency: string; url?: string };

const seenUrls = new Set<string>();
const pending: ObservationPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let scrollTimer: ReturnType<typeof setTimeout> | null = null;

function collectVisible(): void {
  const pageCcy = fallbackCurrencyFromPage();
  const anchors = document.querySelectorAll<HTMLAnchorElement>('a[href*="/marketplace/item/"]');

  let added = 0;
  for (const anchor of anchors) {
    const rect = anchor.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    let url: string;
    try {
      url = new URL(anchor.getAttribute('href') ?? '', location.origin).href;
    } catch {
      continue;
    }

    if (seenUrls.has(url)) continue;

    const listing = extractFromAnchor(anchor, pageCcy);
    if (!listing) continue;

    seenUrls.add(url);
    pending.push({ name: listing.title, price: listing.price, currency: listing.currency, url });
    added++;
  }

  if (added > 0) scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer) return;
  // Wait 30 seconds after first new listing is seen before sending
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 30_000);
}

async function flush(): Promise<void> {
  if (pending.length === 0) return;
  const batch = pending.splice(0, 50);

  try {
    const base = await getApiBase();
    await fetch(`${base.replace(/\/$/, '')}/marketplace/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observations: batch }),
    });
    console.debug(`[WorthIT] Passively recorded ${batch.length} listings`);
  } catch {
    // Silent fail — never interrupt the user's browsing
    pending.unshift(...batch); // Put back for next attempt
  }
}

function startPassiveCollection(): void {
  // Collect what's already visible
  collectVisible();

  // Collect after scrolling stops (infinite scroll loads new cards)
  window.addEventListener('scroll', () => {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(collectVisible, 2_000);
  }, { passive: true });

  // Catch new cards added by Facebook's dynamic rendering
  const observer = new MutationObserver(() => {
    if (scrollTimer) return; // Already scheduled
    collectVisible();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
