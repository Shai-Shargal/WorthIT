import mongoose, { Schema, type InferSchemaType } from 'mongoose';

/**
 * Canonical record of a marketplace listing observed by the passive collection
 * pipeline. One document per unique listing (keyed by `idempotentKey =
 * "<marketplace>:<listingId>"`). Every subsequent observation upserts into the
 * same document, growing `observationCount`, `priceHistory`, and
 * `searchQueries` instead of writing a new row.
 *
 * Coexists with `MarketObservation` (event-log table backing
 * `findSimilarObservations`). Read paths will migrate to `Listing` in a later
 * phase.
 */

const PRICE_HISTORY_CAP = 50;

const priceHistoryEntrySchema = new Schema(
  {
    price: { type: Number, required: true, min: 0 },
    timestamp: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false, versionKey: false },
);

const listingSchema = new Schema(
  {
    idempotentKey: { type: String, required: true, trim: true },
    marketplace: { type: String, required: true, trim: true, lowercase: true, maxlength: 32 },
    listingId: { type: String, required: true, trim: true, maxlength: 128 },
    listingUrl: { type: String, required: true, trim: true, maxlength: 2048 },

    title: { type: String, required: true, trim: true, maxlength: 500 },
    description: { type: String, trim: true, maxlength: 5000 },

    currentPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 8 },
    location: { type: String, trim: true, maxlength: 200 },
    imageUrl: { type: String, trim: true, maxlength: 2048 },
    sellerName: { type: String, trim: true, maxlength: 200 },

    firstSeenAt: { type: Date, required: true, default: () => new Date() },
    lastSeenAt: { type: Date, required: true, default: () => new Date() },
    observationCount: { type: Number, required: true, default: 1, min: 1 },

    priceHistory: { type: [priceHistoryEntrySchema], default: [] },
    searchQueries: { type: [String], default: [] },

    isActive: { type: Boolean, required: true, default: true },
  },
  {
    collection: 'listings',
    timestamps: true,
    versionKey: false,
  },
);

// Primary lookup: idempotent upsert key
listingSchema.index({ idempotentKey: 1 }, { unique: true });

// Marketplace-scoped lookups (admin queries, future per-platform analytics)
listingSchema.index({ marketplace: 1, listingId: 1 });

// "Recently observed" feed and freshness queries from Market Context Gatherer
listingSchema.index({ lastSeenAt: -1 });

// Price-history time queries
listingSchema.index({ 'priceHistory.timestamp': -1 });

export const LISTING_PRICE_HISTORY_CAP = PRICE_HISTORY_CAP;

export type ListingDoc = InferSchemaType<typeof listingSchema>;

export const ListingModel =
  mongoose.models.Listing ?? mongoose.model('Listing', listingSchema);
