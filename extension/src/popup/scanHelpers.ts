import type { AnalyzeProductResponse } from '../../../shared/types/index.js';

export function isSearchPage(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      u.hostname.endsWith('facebook.com') &&
      u.pathname.startsWith('/marketplace') &&
      u.searchParams.has('query')
    );
  } catch {
    return false;
  }
}

export function resolveListingUrl(url: string): string {
  if (url.startsWith('http')) return url;
  return `https://www.facebook.com${url.startsWith('/') ? '' : '/'}${url}`;
}

export function starsHtml(rating: number): string {
  const clamped = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
}

export function buildResultCard(
  rank: number,
  listing: { title: string; price: number; listingUrl: string },
  analysis: AnalyzeProductResponse | null,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'scan-card';

  const rankEl = document.createElement('span');
  rankEl.className = 'scan-card__rank';
  rankEl.textContent = `#${rank}`;

  const body = document.createElement('div');
  body.className = 'scan-card__body';

  const titleEl = document.createElement('div');
  titleEl.className = 'scan-card__title';
  titleEl.title = listing.title;
  titleEl.textContent =
    listing.title.length > 35 ? listing.title.slice(0, 35) + '…' : listing.title;

  const meta = document.createElement('div');
  meta.className = 'scan-card__meta';

  const priceEl = document.createElement('span');
  priceEl.className = 'scan-card__price';
  priceEl.textContent = `₪${listing.price.toLocaleString()}`;
  meta.appendChild(priceEl);

  if (analysis) {
    const starsEl = document.createElement('span');
    starsEl.className = 'scan-card__stars';
    starsEl.textContent = starsHtml(analysis.verdict.worthRating);
    meta.appendChild(starsEl);
  } else {
    const errEl = document.createElement('span');
    errEl.className = 'scan-card__error';
    errEl.textContent = '⚠ Could not analyze';
    meta.appendChild(errEl);
  }

  body.appendChild(titleEl);
  body.appendChild(meta);

  const href = resolveListingUrl(listing.listingUrl);
  const viewLink = document.createElement('a');
  viewLink.className = 'scan-card__view';
  viewLink.textContent = 'View →';
  viewLink.href = href;

  card.appendChild(rankEl);
  card.appendChild(body);
  card.appendChild(viewLink);

  return card;
}
