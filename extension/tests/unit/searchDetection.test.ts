import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectMarketplaceType,
  getSearchQuery,
  isMarketplaceSearchPage,
} from '../../src/marketplace/searchDetection.js';
import {
  extractImageUrl,
  extractListingId,
  extractListingsFromSearchPage,
  extractLocation,
  extractSellerName,
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
// listingExtractor — DOM helpers (jsdom-backed)
// -----------------------------------------------------------------------------

function makeArticle(html: string): Element {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  // Returns the listing root we just constructed.
  return wrapper.firstElementChild as Element;
}

describe('extractLocation', () => {
  it('reads location from data-testid', () => {
    const el = makeArticle('<div><span data-testid="location">Tel Aviv</span></div>');
    expect(extractLocation(el)).toBe('Tel Aviv');
  });

  it('falls back to class-based selector', () => {
    const el = makeArticle('<div><span class="locationLabel">Haifa</span></div>');
    expect(extractLocation(el)).toBe('Haifa');
  });

  it('returns null when there is no location element', () => {
    const el = makeArticle('<div><span>nothing here</span></div>');
    expect(extractLocation(el)).toBeNull();
  });
});

describe('extractImageUrl', () => {
  it('returns the src of the first image', () => {
    const el = makeArticle(
      '<div><img data-testid="listing_image" src="https://cdn.example.com/a.jpg" /></div>',
    );
    expect(extractImageUrl(el)).toBe('https://cdn.example.com/a.jpg');
  });

  it('falls back to a plain img when no targeted selector hits', () => {
    const el = makeArticle('<div><img src="https://cdn.example.com/b.jpg" /></div>');
    expect(extractImageUrl(el)).toBe('https://cdn.example.com/b.jpg');
  });

  it('returns null when there are no images', () => {
    const el = makeArticle('<div><span>no images</span></div>');
    expect(extractImageUrl(el)).toBeNull();
  });
});

describe('extractSellerName', () => {
  it('reads seller from data-testid', () => {
    const el = makeArticle('<div><span data-testid="seller_name">John Seller</span></div>');
    expect(extractSellerName(el)).toBe('John Seller');
  });

  it('returns null when no seller element exists', () => {
    const el = makeArticle('<div><span>nothing</span></div>');
    expect(extractSellerName(el)).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// extractSingleListing — mock Facebook HTML
// -----------------------------------------------------------------------------

function setLocation(href: string): void {
  // jsdom's Window.location is read-only; jsdom supports replace().
  window.history.replaceState({}, '', href);
}

const ORIGINAL_HREF = 'https://www.facebook.com/';

describe('extractSingleListing', () => {
  beforeEach(() => {
    setLocation('https://www.facebook.com/marketplace/search/?query=ps5');
  });

  afterEach(() => {
    setLocation(ORIGINAL_HREF);
  });

  function makeListingMarkup(opts: {
    href?: string | null;
    title?: string | null;
    price?: string | null;
    location?: string | null;
    image?: string | null;
    seller?: string | null;
  }): Element {
    const parts: string[] = [];
    if (opts.href !== null && opts.href !== undefined) {
      parts.push(`<a href="${opts.href}">link</a>`);
    }
    if (opts.title !== null && opts.title !== undefined) {
      parts.push(`<h3>${opts.title}</h3>`);
    }
    if (opts.price !== null && opts.price !== undefined) {
      parts.push(`<span class="price">${opts.price}</span>`);
    }
    if (opts.location) {
      parts.push(`<span data-testid="location">${opts.location}</span>`);
    }
    if (opts.image) {
      parts.push(`<img data-testid="listing_image" src="${opts.image}" />`);
    }
    if (opts.seller) {
      parts.push(`<span data-testid="seller_name">${opts.seller}</span>`);
    }
    return makeArticle(`<div data-testid="marketplace_search_result">${parts.join('')}</div>`);
  }

  it('extracts every field from a complete listing', () => {
    const element = makeListingMarkup({
      href: '/marketplace/item/1367953568531456/',
      title: 'PS5 Console',
      price: '₪ 1,700',
      location: 'Tel Aviv',
      image: 'https://cdn.example.com/ps5.jpg',
      seller: 'John Seller',
    });

    const listing = extractSingleListing(element);
    expect(listing).not.toBeNull();
    expect(listing!.marketplace).toBe('facebook');
    expect(listing!.listingId).toBe('1367953568531456');
    expect(listing!.title).toBe('PS5 Console');
    expect(listing!.price).toBe(1700);
    expect(listing!.currency).toBe('ILS');
    expect(listing!.location).toBe('Tel Aviv');
    expect(listing!.imageUrl).toBe('https://cdn.example.com/ps5.jpg');
    expect(listing!.sellerName).toBe('John Seller');
    expect(listing!.searchQuery).toBe('ps5');
    expect(listing!.observedAt).toBeInstanceOf(Date);
    expect(listing!.listingUrl).toContain('/marketplace/item/1367953568531456');
  });

  it('omits optional fields gracefully when absent', () => {
    const element = makeListingMarkup({
      href: '/marketplace/item/42/',
      title: 'Used Camera',
      price: '$500',
    });

    const listing = extractSingleListing(element);
    expect(listing).not.toBeNull();
    expect(listing!.location).toBeUndefined();
    expect(listing!.imageUrl).toBeUndefined();
    expect(listing!.sellerName).toBeUndefined();
  });

  it('returns null when the listing link is missing', () => {
    const element = makeListingMarkup({
      href: null,
      title: 'No URL',
      price: '$10',
    });
    expect(extractSingleListing(element)).toBeNull();
  });

  it('returns null when the listing has no valid listing id', () => {
    const element = makeListingMarkup({
      href: '/marketplace/category/foo',
      title: 'Bad URL',
      price: '$10',
    });
    expect(extractSingleListing(element)).toBeNull();
  });

  it('returns null when title is missing', () => {
    const element = makeListingMarkup({
      href: '/marketplace/item/77/',
      title: null,
      price: '$10',
    });
    expect(extractSingleListing(element)).toBeNull();
  });

  it('returns null when price is missing or unparseable', () => {
    const element = makeListingMarkup({
      href: '/marketplace/item/77/',
      title: 'Free Stuff',
      price: 'Free',
    });
    expect(extractSingleListing(element)).toBeNull();
  });

  it('uses empty string searchQuery when current URL has none', () => {
    setLocation('https://www.facebook.com/marketplace/search/');
    const element = makeListingMarkup({
      href: '/marketplace/item/9/',
      title: 'Item',
      price: '$1',
    });
    const listing = extractSingleListing(element);
    expect(listing).not.toBeNull();
    expect(listing!.searchQuery).toBe('');
  });
});

// -----------------------------------------------------------------------------
// extractListingsFromSearchPage — integration over a mock document
// -----------------------------------------------------------------------------

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
    document.body.innerHTML = `
      <div>
        <div data-testid="marketplace_search_result">
          <a href="/marketplace/item/100/">link</a>
          <h3>Item One</h3>
          <span class="price">$50</span>
          <span data-testid="location">Tel Aviv</span>
        </div>
        <div data-testid="marketplace_search_result">
          <a href="/marketplace/item/200/">link</a>
          <h3>Item Two</h3>
          <span class="price">₪ 2,000</span>
          <img data-testid="listing_image" src="https://cdn.example.com/i.jpg" />
          <span data-testid="seller_name">Jane</span>
        </div>
        <div data-testid="marketplace_search_result">
          <a href="/marketplace/item/300/">link</a>
          <h3>Item Three</h3>
          <span class="price">Free</span>
        </div>
        <div data-testid="marketplace_search_result">
          <h3>No URL</h3>
          <span class="price">$10</span>
        </div>
      </div>
    `;

    const listings = extractListingsFromSearchPage();
    expect(listings).toHaveLength(2);

    expect(listings[0].listingId).toBe('100');
    expect(listings[0].title).toBe('Item One');
    expect(listings[0].price).toBe(50);
    expect(listings[0].location).toBe('Tel Aviv');
    expect(listings[0].searchQuery).toBe('ps5');

    expect(listings[1].listingId).toBe('200');
    expect(listings[1].price).toBe(2000);
    expect(listings[1].imageUrl).toBe('https://cdn.example.com/i.jpg');
    expect(listings[1].sellerName).toBe('Jane');
  });
});
