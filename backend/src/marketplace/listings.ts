import { ListingModel, LISTING_PRICE_HISTORY_CAP } from '../database/models/Listing.js';
import { isMongoReady } from '../database/mongoose.js';
import type { MarketObservation } from '../../../shared/types/index.js';

/**
 * Inbound observation, post-validation. Mirrors the extension's
 * `ObservedListing` interface (`extension/src/marketplace/types.ts`) — see
 * `marketplace.route.ts` for the request-shape validation.
 */
export interface ListingObservationInput {
  marketplace: string;
  listingId: string;
  listingUrl: string;
  title: string;
  price: number;
  currency: string;
  searchQuery?: string;
  location?: string;
  imageUrl?: string;
  sellerName?: string;
  description?: string;
  observedAt?: Date;
}

export type ObservationAction = 'created' | 'updated' | 'skipped';

export interface ObservationResult {
  listingId: string;
  action: ObservationAction;
  priceChanged?: boolean;
  reason?: string;
}

function buildIdempotentKey(marketplace: string, listingId: string): string {
  return `${marketplace.toLowerCase()}:${listingId}`;
}

/**
 * Idempotent upsert for a single observation.
 *
 * - New listing → insert with `priceHistory: [{price, timestamp}]`.
 * - Existing listing → bump `observationCount`, refresh `lastSeenAt`, push to
 *   `priceHistory` only when the price actually changed (FIFO-capped at
 *   {@link LISTING_PRICE_HISTORY_CAP}), and add the searchQuery if it's not
 *   already tracked.
 *
 * Concurrency: a unique index on `idempotentKey` guarantees we never end up
 * with two docs for the same listing. On a race we retry once after the
 * conflicting upsert lands.
 */
export async function processObservation(
  obs: ListingObservationInput,
): Promise<ObservationResult> {
  if (!isMongoReady()) {
    return { listingId: obs.listingId, action: 'skipped', reason: 'db_unavailable' };
  }

  const idempotentKey = buildIdempotentKey(obs.marketplace, obs.listingId);
  const observedAt = obs.observedAt ?? new Date();

  try {
    const existing = await ListingModel.findOne({ idempotentKey });

    if (!existing) {
      const doc = new ListingModel({
        idempotentKey,
        marketplace: obs.marketplace.toLowerCase(),
        listingId: obs.listingId,
        listingUrl: obs.listingUrl,
        title: obs.title,
        description: obs.description,
        currentPrice: obs.price,
        currency: obs.currency.toUpperCase(),
        location: obs.location,
        imageUrl: obs.imageUrl,
        sellerName: obs.sellerName,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        observationCount: 1,
        priceHistory: [{ price: obs.price, timestamp: observedAt }],
        searchQueries: obs.searchQuery ? [obs.searchQuery] : [],
      });

      try {
        await doc.save();
        return { listingId: obs.listingId, action: 'created', priceChanged: false };
      } catch (err) {
        // Race: another batch created the doc between findOne and save.
        // Fall through to the update path with the now-existing doc.
        if (isDuplicateKeyError(err)) {
          const racedDoc = await ListingModel.findOne({ idempotentKey });
          if (racedDoc) {
            return await updateExistingListing(racedDoc, obs, observedAt);
          }
        }
        throw err;
      }
    }

    return await updateExistingListing(existing, obs, observedAt);
  } catch (err) {
    console.error(
      '[listings.processObservation] failed:',
      err instanceof Error ? err.message : err,
    );
    return { listingId: obs.listingId, action: 'skipped', reason: 'db_error' };
  }
}

async function updateExistingListing(
  // mongoose Document — typed loosely because InferSchemaType returns a plain
  // shape, not a hydrated document with .save()
  listing: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  obs: ListingObservationInput,
  observedAt: Date,
): Promise<ObservationResult> {
  const priceChanged = listing.currentPrice !== obs.price;

  listing.lastSeenAt = observedAt;
  listing.observationCount = (listing.observationCount ?? 1) + 1;

  if (priceChanged) {
    listing.currentPrice = obs.price;
    listing.priceHistory.push({ price: obs.price, timestamp: observedAt });
    // FIFO trim: drop oldest entries once we exceed the cap so a hot listing
    // can't blow past Mongo's 16MB document limit.
    if (listing.priceHistory.length > LISTING_PRICE_HISTORY_CAP) {
      listing.priceHistory.splice(
        0,
        listing.priceHistory.length - LISTING_PRICE_HISTORY_CAP,
      );
    }
  }

  if (obs.searchQuery && !listing.searchQueries.includes(obs.searchQuery)) {
    listing.searchQueries.push(obs.searchQuery);
  }

  // Backfill optional fields if missing on the existing doc (the extension
  // sometimes can't pull a sellerName/image until later passes).
  if (!listing.location && obs.location) listing.location = obs.location;
  if (!listing.imageUrl && obs.imageUrl) listing.imageUrl = obs.imageUrl;
  if (!listing.sellerName && obs.sellerName) listing.sellerName = obs.sellerName;
  if (!listing.description && obs.description) listing.description = obs.description;

  await listing.save();
  return { listingId: obs.listingId, action: 'updated', priceChanged };
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: number }).code === 11000
  );
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function toKeywords(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - Math.max(0, days) * 24 * 60 * 60 * 1000);
}

export interface ListingQuery {
  name: string;
  currency: string;
  sinceDays?: number;
  limit?: number;
}

/**
 * Find listings from the passive-collection `Listing` collection that match
 * the given product name keywords, returning them as `MarketObservation`
 * objects so the price-gathering pipeline can consume them without changes.
 *
 * Source is set to `'facebook-passive'` to distinguish real collected prices
 * from Tavily estimates. These are treated as `real` quality data.
 */
export async function findSimilarListings(query: ListingQuery): Promise<MarketObservation[]> {
  if (!isMongoReady()) return [];

  const keywords = toKeywords(query.name);
  if (keywords.length === 0) return [];

  const since = typeof query.sinceDays === 'number' ? daysAgo(query.sinceDays) : undefined;
  const limit = Math.max(1, Math.min(500, query.limit ?? 100));

  const filter: Record<string, unknown> = {
    currency: query.currency.toUpperCase(),
    // Only active listings seen within the requested window
    ...(since ? { lastSeenAt: { $gte: since } } : {}),
    // All keywords must appear in the title (case-insensitive)
    $and: keywords.map((kw) => ({
      title: { $regex: escapeRegex(kw), $options: 'i' },
    })),
  };

  try {
    const docs = await ListingModel.find(filter)
      .sort({ lastSeenAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return docs.map((doc) => ({
      productName: doc.title,
      observedPrice: doc.currentPrice,
      currency: doc.currency,
      source: 'facebook-passive',
      location: doc.location,
      timestamp: doc.lastSeenAt,
    })) as MarketObservation[];
  } catch (err) {
    console.error(
      '[listings.findSimilarListings] failed:',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
