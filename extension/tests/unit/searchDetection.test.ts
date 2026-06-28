import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectMarketplaceType,
  getSearchQuery,
  isMarketplaceSearchPage,
} from '../../src/marketplace/searchDetection.js';
import {
  extractListingId,
  extractListingsFromSearchPage,
  extractSingleListing,
  parsePrice,
} from '../../src/marketplace/listingExtractor.js';

// -----------------------------------------------------------------------------
// searchDetection
// -----------------------------------------------------------------------------

describe('isMarketplaceSearchPage', () => {
  it('matches desktop marketplace search', () => {
    expect(
      isMarketplaceSearchPage('https://www.facebook.com/marketplace/search/?query=ps5'),
    ).toBe(true);
  });

  it('matches marketplace search with a location subpath', () => {
    expect(
      isMarketplaceSearchPage(
        'https://www.facebook.com/marketplace/telaviv/search/?query=iphone',
      ),
    ).toBe(true);
  });

  it('matches mobile marketplace search', () => {
    expect(isMarketplaceSearchPage('https://m.facebook.com/marketplace/search/')).toBe(true);
  });

  it('rejects marketplace home (non-search)', () => {
    expect(isMarketplaceSearchPage('https://www.facebook.com/marketplace/')).toBe(false);
  });

  it('rejects unrelated facebook URLs', () => {
    expect(isMarketplaceSearchPage('https://www.facebook.com/groups/12345/')).toBe(false);
  });

  it('rejects a non-facebook URL', () => {
    expect(isMarketplaceSearchPage('https://www.yad2.co.il/products/search?q=ps5')).toBe(false);
  });
});

describe('getSearchQuery', () => {
  it('extracts the query parameter', () => {
    expect(
      getSearchQuery('https://www.facebook.com/marketplace/search/?query=ps5'),
    ).toBe('ps5');
  });

  it('returns null when there is no query parameter', () => {
    expect(
      getSearchQuery('https://www.facebook.com/marketplace/search/'),
    ).toBeNull();
  });

  it('returns null for malformed URLs', () => {
    expect(getSearchQuery('not-a-real-url')).toBeNull();
  });
});

describe('detectMarketplaceType', () => {
  it('detects facebook on desktop', () => {
    expect(detectMarketplaceType('https://www.facebook.com/marketplace/search/?query=ps5')).toBe(
      'facebook',
    );
  });

  it('detects facebook on mobile', () => {
    expect(detectMarketplaceType('https://m.facebook.com/marketplace/search/')).toBe('facebook');
  });

  it('returns null for unrelated marketplaces', () => {
    expect(detectMarketplaceType('https://www.yad2.co.il/products/12345')).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// listingExtractor — pure helpers
// -----------------------------------------------------------------------------

describe('extractListingId', () => {
  it('extracts numeric listing id from marketplace item URL', () => {
    expect(extractListingId('https://www.facebook.com/marketplace/item/1367953568531456'))
      .toBe('1367953568531456');
  });

  it('extracts numeric listing id from relative URL', () => {
    expect(extractListingId('/marketplace/item/987654321/?ref=search')).toBe('987654321');
  });

  it('returns null when the URL has no item segment', () => {
    expect(extractListingId('https://www.facebook.com/marketplace/telaviv/search')).toBeNull();
  });

  it('returns null for null/empty input', () => {
    expect(extractListingId(null)).toBeNull();
    expect(extractListingId('')).toBeNull();
  });
});

describe('parsePrice', () => {
  it('parses ILS formatted price', () => {
    expect(parsePrice('₪ 1,700')).toBe(1700);
  });

  it('parses USD formatted price', () => {
    expect(parsePrice('$500')).toBe(500);
  });

  it('parses price with decimal (US format) and rounds', () => {
    expect(parsePrice('1,500.99')).toBe(1501);
  });

  it('parses European-formatted price (period thousands, comma decimal)', () => {
    expect(parsePrice('1.000,99')).toBe(1001);
  });

  it('parses plain integer with trailing currency code', () => {
    expect(parsePrice('1700 ILS')).toBe(1700);
  });

  it('returns -1 for invalid / empty price text', () => {
    expect(parsePrice('Free')).toBe(-1);
    expect(parsePrice('')).toBe(-1);
    expect(parsePrice(null)).toBe(-1);
    expect(parsePrice(undefined)).toBe(-1);
  });
});

// -----------------------------------------------------------------------------
// extractSingleListing — real Facebook DOM shape
//
// The <a href="/marketplace/item/{id}"> wraps the entire card. Title and
// location come from img[alt] ("{title} in {city}, {district}"). Price comes
// from the first ₪-prefixed text node inside the link.
// -----------------------------------------------------------------------------

function setLocation(href: string): void {
  window.history.replaceState({}, '', href);
}

const ORIGINAL_HREF = 'https://www.facebook.com/';

/** Builds a real-shape Facebook card <a> element and returns it as HTMLAnchorElement. */
function makeCardLink(opts: {
  href?: string | null;
  ariaLabel?: string;
  imgAlt?: string | null;
  imgSrc?: string | null;
  price?: string | null;
  extraPrices?: string[];
}): HTMLAnchorElement {
  const a = document.createElement('a');
  if (opts.href != null) a.setAttribute('href', opts.href);
  if (opts.ariaLabel) a.setAttribute('aria-label', opts.ariaLabel);

  if (opts.imgAlt != null || opts.imgSrc != null) {
    const img = document.createElement('img');
    if (opts.imgAlt != null) img.setAttribute('alt', opts.imgAlt);
    if (opts.imgSrc != null) img.setAttribute('src', opts.imgSrc);
    a.appendChild(img);
  }

  // Facebook renders the current price first, then optionally the struck-through original price.
  if (opts.price != null) {
    const priceSpan = document.createElement('span');
    priceSpan.textContent = opts.price;
    a.appendChild(priceSpan);
  }
  for (const extra of opts.extraPrices ?? []) {
    const span = document.createElement('span');
    span.textContent = extra;
    a.appendChild(span);
  }

  return a;
}

describe('extractSingleListing', () => {
  beforeEach(() => {
    setLocation('https://www.facebook.com/marketplace/search/?query=ps5');
  });

  afterEach(() => {
    setLocation(ORIGINAL_HREF);
  });

  it('extracts all fields from a complete listing card', () => {
    const link = makeCardLink({
      href: '/marketplace/item/1367953568531456/?ref=search',
      ariaLabel: 'PS5 Console, ₪1,700, Tel Aviv, TA, listing 1367953568531456',
      imgAlt: 'PS5 Console in Tel Aviv, TA',
      imgSrc: 'https://cdn.example.com/ps5.jpg',
      price: '₪1,700',
    });

    const listing = extractSingleListing(link);
    expect(listing).not.toBeNull();
    expect(listing!.marketplace).toBe('facebook');
    expect(listing!.listingId).toBe('1367953568531456');
    expect(listing!.title).toBe('PS5 Console');
    expect(listing!.price).toBe(1700);
    expect(listing!.currency).toBe('ILS');
    expect(listing!.location).toBe('Tel Aviv, TA');
    expect(listing!.imageUrl).toContain('cdn.example.com/ps5.jpg');
    expect(listing!.searchQuery).toBe('ps5');
    expect(listing!.observedAt).toBeInstanceOf(Date);
    expect(listing!.listingUrl).toContain('/marketplace/item/1367953568531456');
  });

  it('picks the first (current) price when two prices are present (strikethrough case)', () => {
    const link = makeCardLink({
      href: '/marketplace/item/42/',
      imgAlt: 'Used Camera in Tel Aviv, TA',
      price: '₪1,600',
      extraPrices: ['₪1,900'],
    });
    const listing = extractSingleListing(link);
    expect(listing).not.toBeNull();
    expect(listing!.price).toBe(1600);
  });

  it('falls back to aria-label for title when img alt is absent', () => {
    const link = makeCardLink({
      href: '/marketplace/item/99/',
      ariaLabel: 'PS5 Slim, ₪1,800, Haifa, HA, listing 99',
      price: '₪1,800',
    });
    const listing = extractSingleListing(link);
    expect(listing).not.toBeNull();
    expect(listing!.title).toBe('PS5 Slim');
    expect(listing!.location).toBeUndefined(); // no img alt → no location
  });

  it('handles title with commas via aria-label fallback', () => {
    const link = makeCardLink({
      href: '/marketplace/item/55/',
      ariaLabel: 'Ps5, פלייסטיישן 5, ₪1,500, אשקלון, D, listing 55',
      imgAlt: 'Ps5, פלייסטיישן 5 in אשקלון, D',
      price: '₪1,500',
    });
    const listing = extractSingleListing(link);
    expect(listing).not.toBeNull();
    expect(listing!.title).toBe('Ps5, פלייסטיישן 5');
    expect(listing!.location).toBe('אשקלון, D');
  });

  it('omits optional fields gracefully when absent', () => {
    const link = makeCardLink({
      href: '/marketplace/item/42/',
      ariaLabel: 'Used Camera, $500, City, XX, listing 42',
      price: '$500',
    });
    const listing = extractSingleListing(link);
    expect(listing).not.toBeNull();
    expect(listing!.location).toBeUndefined();
    expect(listing!.imageUrl).toBeUndefined();
  });

  it('returns null when href is missing', () => {
    const link = makeCardLink({ imgAlt: 'PS5 in Tel Aviv, TA', price: '$10' });
    expect(extractSingleListing(link)).toBeNull();
  });

  it('returns null when href has no valid listing id', () => {
    const link = makeCardLink({
      href: '/marketplace/category/foo',
      imgAlt: 'PS5 in Tel Aviv, TA',
      price: '$10',
    });
    expect(extractSingleListing(link)).toBeNull();
  });

  it('returns null when no title can be extracted', () => {
    const link = makeCardLink({
      href: '/marketplace/item/77/',
      price: '$10',
      // no imgAlt, no ariaLabel
    });
    expect(extractSingleListing(link)).toBeNull();
  });

  it('returns null when price is unparseable ("Free")', () => {
    const link = makeCardLink({
      href: '/marketplace/item/77/',
      imgAlt: 'Free Stuff in Tel Aviv, TA',
      price: 'Free',
    });
    expect(extractSingleListing(link)).toBeNull();
  });

  it('returns null when price is absent', () => {
    const link = makeCardLink({
      href: '/marketplace/item/77/',
      imgAlt: 'PS5 in Tel Aviv, TA',
    });
    expect(extractSingleListing(link)).toBeNull();
  });

  it('uses empty searchQuery when current URL has no query param', () => {
    setLocation('https://www.facebook.com/marketplace/search/');
    const link = makeCardLink({
      href: '/marketplace/item/9/',
      imgAlt: 'Item in Tel Aviv, TA',
      price: '$1',
    });
    const listing = extractSingleListing(link);
    expect(listing).not.toBeNull();
    expect(listing!.searchQuery).toBe('');
  });
});

// -----------------------------------------------------------------------------
// extractListingsFromSearchPage — integration over a mock document
// -----------------------------------------------------------------------------

/** Builds a full Facebook search page HTML with multiple card links. */
function makeSearchPage(cards: Array<{
  id: string;
  title: string;
  price: string;
  city?: string;
  district?: string;
  imgSrc?: string;
}>): string {
  return `<div>${cards.map(c => {
    const loc = c.city && c.district ? `${c.city}, ${c.district}` : '';
    const alt = loc ? `${c.title} in ${loc}` : c.title;
    const img = `<img alt="${alt}"${c.imgSrc ? ` src="${c.imgSrc}"` : ''}>`;
    return `<div><a href="/marketplace/item/${c.id}/" aria-label="${c.title}, ${c.price}, ${loc}, listing ${c.id}">${img}<span>${c.price}</span></a></div>`;
  }).join('')}</div>`;
}

describe('extractListingsFromSearchPage', () => {
  beforeEach(() => {
    setLocation('https://www.facebook.com/marketplace/search/?query=ps5');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    setLocation(ORIGINAL_HREF);
  });

  it('returns an empty array when there are no listings on the page', () => {
    document.body.innerHTML = '<div>no marketplace content</div>';
    expect(extractListingsFromSearchPage()).toEqual([]);
  });

  it('extracts multiple listings and skips invalid ones', () => {
    document.body.innerHTML = makeSearchPage([
      { id: '100', title: 'Item One', price: '$50', city: 'Tel Aviv', district: 'TA' },
      { id: '200', title: 'Item Two', price: '₪2,000', city: 'Haifa', district: 'HA', imgSrc: 'https://cdn.example.com/i.jpg' },
    ]) + `
      <div><a href="/marketplace/item/300/"><img alt="Free stuff in Tel Aviv, TA"><span>Free</span></a></div>
      <div><span>no link here</span></div>
    `;

    const listings = extractListingsFromSearchPage();
    expect(listings).toHaveLength(2);

    expect(listings[0].listingId).toBe('100');
    expect(listings[0].title).toBe('Item One');
    expect(listings[0].price).toBe(50);
    expect(listings[0].location).toBe('Tel Aviv, TA');
    expect(listings[0].searchQuery).toBe('ps5');

    expect(listings[1].listingId).toBe('200');
    expect(listings[1].price).toBe(2000);
    expect(listings[1].imageUrl).toContain('cdn.example.com/i.jpg');
  });

  it('deduplicates cards with the same listing id', () => {
    document.body.innerHTML = makeSearchPage([
      { id: '500', title: 'PS5', price: '₪1,500', city: 'Tel Aviv', district: 'TA' },
      { id: '500', title: 'PS5 duplicate', price: '₪1,500', city: 'Tel Aviv', district: 'TA' },
    ]);
    const listings = extractListingsFromSearchPage();
    expect(listings).toHaveLength(1);
    expect(listings[0].title).toBe('PS5');
  });
});
