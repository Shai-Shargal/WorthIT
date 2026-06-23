import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListingModel, LISTING_PRICE_HISTORY_CAP } from '../src/database/models/Listing.js';
import { processObservation } from '../src/marketplace/listings.js';

// Wire the mongo-ready check to "ready" by default — individual tests below
// flip it off to exercise the not-ready branch.
vi.mock('../src/database/mongoose.js', () => ({
  isMongoReady: vi.fn(() => true),
}));

// We keep the real Listing schema (so validation tests assert real behavior)
// and only spy on the document-level save() + ListingModel.findOne for the
// processObservation unit tests. Integration tests cover the actual DB path.

function makeValidListing(overrides: Partial<Record<string, unknown>> = {}) {
  return new ListingModel({
    idempotentKey: 'facebook:item-1',
    marketplace: 'facebook',
    listingId: 'item-1',
    listingUrl: 'https://www.facebook.com/marketplace/item/item-1',
    title: 'iPhone 13',
    currentPrice: 1500,
    currency: 'ILS',
    ...overrides,
  });
}

describe('Listing schema validation', () => {
  it('accepts a minimal valid document', () => {
    const doc = makeValidListing();
    expect(doc.validateSync()).toBeUndefined();
  });

  it('defaults observationCount to 1', () => {
    const doc = makeValidListing();
    expect((doc as unknown as { observationCount: number }).observationCount).toBe(1);
  });

  it('defaults isActive to true', () => {
    const doc = makeValidListing();
    expect((doc as unknown as { isActive: boolean }).isActive).toBe(true);
  });

  it('defaults priceHistory to empty array', () => {
    const doc = makeValidListing();
    expect((doc as unknown as { priceHistory: unknown[] }).priceHistory).toEqual([]);
  });

  it('defaults searchQueries to empty array', () => {
    const doc = makeValidListing();
    expect((doc as unknown as { searchQueries: unknown[] }).searchQueries).toEqual([]);
  });

  it('uppercases currency', () => {
    const doc = makeValidListing({ currency: 'ils' });
    expect((doc as unknown as { currency: string }).currency).toBe('ILS');
  });

  it('lowercases marketplace', () => {
    const doc = makeValidListing({ marketplace: 'Facebook' });
    expect((doc as unknown as { marketplace: string }).marketplace).toBe('facebook');
  });

  it('requires idempotentKey', () => {
    const doc = makeValidListing({ idempotentKey: undefined });
    const err = doc.validateSync();
    expect(err?.errors['idempotentKey']).toBeDefined();
  });

  it('requires marketplace', () => {
    const doc = makeValidListing({ marketplace: undefined });
    const err = doc.validateSync();
    expect(err?.errors['marketplace']).toBeDefined();
  });

  it('requires listingId', () => {
    const doc = makeValidListing({ listingId: undefined });
    const err = doc.validateSync();
    expect(err?.errors['listingId']).toBeDefined();
  });

  it('requires listingUrl', () => {
    const doc = makeValidListing({ listingUrl: undefined });
    const err = doc.validateSync();
    expect(err?.errors['listingUrl']).toBeDefined();
  });

  it('requires title', () => {
    const doc = makeValidListing({ title: undefined });
    const err = doc.validateSync();
    expect(err?.errors['title']).toBeDefined();
  });

  it('requires currentPrice', () => {
    const doc = makeValidListing({ currentPrice: undefined });
    const err = doc.validateSync();
    expect(err?.errors['currentPrice']).toBeDefined();
  });

  it('rejects negative currentPrice', () => {
    const doc = makeValidListing({ currentPrice: -1 });
    const err = doc.validateSync();
    expect(err?.errors['currentPrice']).toBeDefined();
  });

  it('accepts currentPrice of 0 (free items)', () => {
    const doc = makeValidListing({ currentPrice: 0 });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects title over 500 chars', () => {
    const doc = makeValidListing({ title: 'x'.repeat(501) });
    const err = doc.validateSync();
    expect(err?.errors['title']).toBeDefined();
  });

  it('rejects listingUrl over 2048 chars', () => {
    const doc = makeValidListing({ listingUrl: 'https://x.com/' + 'a'.repeat(2050) });
    const err = doc.validateSync();
    expect(err?.errors['listingUrl']).toBeDefined();
  });

  it('rejects priceHistory entries with negative price', () => {
    const doc = makeValidListing({
      priceHistory: [{ price: -10, timestamp: new Date() }],
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  it('exposes LISTING_PRICE_HISTORY_CAP = 50', () => {
    expect(LISTING_PRICE_HISTORY_CAP).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// processObservation unit tests
//
// We spy on:
//   - ListingModel.findOne (returns either a fake hydrated doc or null)
//   - Document.prototype.save (no-op success by default)
//
// The fake hydrated doc is a plain object that satisfies the mutations the
// service performs (mutate fields + call .save()). Integration tests cover
// the real DB round-trip.
// ---------------------------------------------------------------------------

interface FakeListingDoc {
  idempotentKey: string;
  currentPrice: number;
  observationCount: number;
  priceHistory: Array<{ price: number; timestamp: Date }>;
  searchQueries: string[];
  lastSeenAt?: Date;
  location?: string;
  imageUrl?: string;
  sellerName?: string;
  description?: string;
  save: () => Promise<void>;
}

function makeFakeListing(initial: Partial<FakeListingDoc>): FakeListingDoc {
  return {
    idempotentKey: 'facebook:item-1',
    currentPrice: 1500,
    observationCount: 1,
    priceHistory: [{ price: 1500, timestamp: new Date('2026-06-20') }],
    searchQueries: [],
    lastSeenAt: new Date('2026-06-20'),
    ...initial,
    save: vi.fn(async () => undefined),
  };
}

const baseObs = {
  marketplace: 'facebook',
  listingId: 'item-1',
  listingUrl: 'https://www.facebook.com/marketplace/item/item-1',
  title: 'iPhone 13',
  price: 1500,
  currency: 'ILS',
  searchQuery: 'iphone',
};

let findOneSpy: ReturnType<typeof vi.spyOn>;
let saveSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  findOneSpy = vi.spyOn(ListingModel, 'findOne');
  // Stub document.prototype.save so creating a new ListingModel won't try to
  // hit Mongo. Tests that need a save failure (e.g. dup-key race) override.
  saveSpy = vi
    .spyOn(ListingModel.prototype, 'save')
    .mockImplementation(async function (this: unknown) {
      return this;
    });
});

describe('processObservation', () => {
  it('creates a new listing when none exists', async () => {
    findOneSpy.mockResolvedValueOnce(null);
    const result = await processObservation(baseObs);
    expect(result.action).toBe('created');
    expect(result.listingId).toBe('item-1');
    expect(result.priceChanged).toBe(false);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('updates existing listing without price change', async () => {
    const fake = makeFakeListing({ currentPrice: 1500, searchQueries: ['iphone'] });
    findOneSpy.mockResolvedValueOnce(fake as unknown as ReturnType<typeof ListingModel.findOne>);

    const result = await processObservation(baseObs);

    expect(result.action).toBe('updated');
    expect(result.priceChanged).toBe(false);
    expect(fake.observationCount).toBe(2);
    expect(fake.priceHistory).toHaveLength(1);
  });

  it('appends to priceHistory when price changes', async () => {
    const fake = makeFakeListing({ currentPrice: 1500, searchQueries: ['iphone'] });
    findOneSpy.mockResolvedValueOnce(fake as unknown as ReturnType<typeof ListingModel.findOne>);

    const result = await processObservation({ ...baseObs, price: 1400 });

    expect(result.priceChanged).toBe(true);
    expect(fake.currentPrice).toBe(1400);
    expect(fake.priceHistory).toHaveLength(2);
    expect(fake.priceHistory[1].price).toBe(1400);
  });

  it('dedups searchQueries', async () => {
    const fake = makeFakeListing({ searchQueries: ['iphone'] });
    findOneSpy.mockResolvedValueOnce(fake as unknown as ReturnType<typeof ListingModel.findOne>);

    await processObservation({ ...baseObs, searchQuery: 'iphone' });

    expect(fake.searchQueries).toEqual(['iphone']);
  });

  it('adds new searchQuery to the array', async () => {
    const fake = makeFakeListing({ searchQueries: ['iphone'] });
    findOneSpy.mockResolvedValueOnce(fake as unknown as ReturnType<typeof ListingModel.findOne>);

    await processObservation({ ...baseObs, searchQuery: 'iphone 13' });

    expect(fake.searchQueries).toEqual(['iphone', 'iphone 13']);
  });

  it('backfills missing optional fields on update', async () => {
    const fake = makeFakeListing({});
    findOneSpy.mockResolvedValueOnce(fake as unknown as ReturnType<typeof ListingModel.findOne>);

    await processObservation({
      ...baseObs,
      location: 'Tel Aviv',
      imageUrl: 'https://x.com/a.jpg',
      sellerName: 'Alice',
      description: 'Mint condition',
    });

    expect(fake.location).toBe('Tel Aviv');
    expect(fake.imageUrl).toBe('https://x.com/a.jpg');
    expect(fake.sellerName).toBe('Alice');
    expect(fake.description).toBe('Mint condition');
  });

  it('does NOT overwrite existing optional fields on update', async () => {
    const fake = makeFakeListing({
      location: 'Haifa',
      imageUrl: 'https://x.com/original.jpg',
    });
    findOneSpy.mockResolvedValueOnce(fake as unknown as ReturnType<typeof ListingModel.findOne>);

    await processObservation({
      ...baseObs,
      location: 'Tel Aviv',
      imageUrl: 'https://x.com/new.jpg',
    });

    expect(fake.location).toBe('Haifa');
    expect(fake.imageUrl).toBe('https://x.com/original.jpg');
  });

  it('FIFO-trims priceHistory at the cap', async () => {
    const oldHistory = Array.from({ length: LISTING_PRICE_HISTORY_CAP }, (_, i) => ({
      price: 1500 - i,
      timestamp: new Date(2026, 0, i + 1),
    }));
    const fake = makeFakeListing({
      currentPrice: 1500 - (LISTING_PRICE_HISTORY_CAP - 1),
      observationCount: LISTING_PRICE_HISTORY_CAP,
      priceHistory: oldHistory,
      searchQueries: ['iphone'],
    });
    findOneSpy.mockResolvedValueOnce(fake as unknown as ReturnType<typeof ListingModel.findOne>);

    await processObservation({ ...baseObs, price: 999 });

    expect(fake.priceHistory.length).toBe(LISTING_PRICE_HISTORY_CAP);
    expect(fake.priceHistory[fake.priceHistory.length - 1].price).toBe(999);
    // The oldest entry (price: 1500, index 0) was dropped.
    expect(fake.priceHistory[0].price).toBe(1500 - 1);
  });

  it('returns skipped when mongo is not ready', async () => {
    const { isMongoReady } = await import('../src/database/mongoose.js');
    vi.mocked(isMongoReady).mockReturnValueOnce(false);

    const result = await processObservation(baseObs);

    expect(result.action).toBe('skipped');
    expect(result.reason).toBe('db_unavailable');
    expect(findOneSpy).not.toHaveBeenCalled();
  });

  it('returns skipped on a database error', async () => {
    findOneSpy.mockRejectedValueOnce(new Error('boom'));
    const result = await processObservation(baseObs);
    expect(result.action).toBe('skipped');
    expect(result.reason).toBe('db_error');
  });

  it('builds idempotentKey lowercase even if marketplace is capitalized', async () => {
    findOneSpy.mockResolvedValueOnce(null);
    await processObservation({ ...baseObs, marketplace: 'Facebook' });
    expect(findOneSpy).toHaveBeenCalledWith({ idempotentKey: 'facebook:item-1' });
  });

  it('recovers from duplicate-key race by updating the raced doc', async () => {
    const racedDoc = makeFakeListing({ currentPrice: 1500 });
    findOneSpy.mockResolvedValueOnce(null); // first lookup: nothing
    findOneSpy.mockResolvedValueOnce(racedDoc as unknown as ReturnType<typeof ListingModel.findOne>);
    const dupKeyErr = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    saveSpy.mockRejectedValueOnce(dupKeyErr);

    const result = await processObservation({ ...baseObs, price: 1400 });

    expect(result.action).toBe('updated');
    expect(result.priceChanged).toBe(true);
    expect(racedDoc.currentPrice).toBe(1400);
  });
});
