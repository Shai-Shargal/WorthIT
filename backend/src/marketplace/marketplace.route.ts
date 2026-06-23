import { Router } from 'express';
import { z } from 'zod';
import { recordObservations } from './marketObservations.js';
import { processObservation, type ObservationResult } from './listings.js';

export const marketplaceRouter = Router();

/**
 * Legacy payload — used by:
 *  - browse/category passive collection (`startPassiveCollection`)
 *  - item-detail silent save (`silentlySaveItemListing`)
 *
 * Writes to the flat `MarketObservation` event log.
 */
const legacyObservationSchema = z.object({
  name: z.string().trim().min(1).max(300),
  price: z.number().finite().positive(),
  currency: z.string().trim().min(1).max(8),
  description: z.string().trim().max(5000).optional(),
  url: z.string().url().optional(),
});

/**
 * New payload — used by:
 *  - search-page passive collection (`MarketplaceObserver`)
 *
 * Upserts into the `Listing` model, tracking price history per listing.
 */
const listingObservationSchema = z.object({
  marketplace: z.string().trim().min(1).max(32),
  listingId: z.string().trim().min(1).max(128),
  listingUrl: z.string().trim().url().max(2048),
  title: z.string().trim().min(1).max(500),
  price: z.number().finite().min(0),
  currency: z.string().trim().min(1).max(8),
  searchQuery: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  imageUrl: z.string().trim().max(2048).optional(),
  sellerName: z.string().trim().max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  observedAt: z.union([z.string(), z.date()]).optional(),
});

const observationSchema = z.union([listingObservationSchema, legacyObservationSchema]);

const batchSchema = z.object({
  observations: z.array(z.unknown()).min(1).max(50),
});

const FACEBOOK_HOST_PATTERN = /(^|\.)facebook\.com$/i;

function isFacebookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return FACEBOOK_HOST_PATTERN.test(parsed.hostname);
  } catch {
    return false;
  }
}

function isListingShape(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'listingId' in value &&
    'marketplace' in value
  );
}

marketplaceRouter.post('/observe', async (req, res, next) => {
  try {
    const envelope = batchSchema.safeParse(req.body);
    if (!envelope.success) {
      return res.status(400).json({ error: 'Invalid observations payload' });
    }

    const now = new Date();
    const legacyDocs: Array<{
      productName: string;
      observedPrice: number;
      currency: string;
      source: 'facebook-browse';
      description?: string;
      timestamp: Date;
    }> = [];
    const listingResults: ObservationResult[] = [];
    let skippedCount = 0;

    // Per-item validation: each observation is classified as new-format
    // (listingId + marketplace present) or legacy. Bad items are skipped so a
    // single malformed entry can't poison the entire batch — same behavior the
    // extension already assumes for its silent passive collection.
    for (const raw of envelope.data.observations) {
      if (isListingShape(raw)) {
        const parsed = listingObservationSchema.safeParse(raw);
        if (!parsed.success) {
          skippedCount += 1;
          continue;
        }
        const obs = parsed.data;
        // Facebook-only for now. Yad2/Amazon will lift this check when their
        // own URL hosts are added.
        if (obs.marketplace.toLowerCase() === 'facebook' && !isFacebookUrl(obs.listingUrl)) {
          skippedCount += 1;
          continue;
        }
        const observedAt =
          obs.observedAt instanceof Date
            ? obs.observedAt
            : typeof obs.observedAt === 'string'
              ? new Date(obs.observedAt)
              : now;
        const result = await processObservation({
          marketplace: obs.marketplace,
          listingId: obs.listingId,
          listingUrl: obs.listingUrl,
          title: obs.title,
          price: obs.price,
          currency: obs.currency,
          searchQuery: obs.searchQuery,
          location: obs.location,
          imageUrl: obs.imageUrl,
          sellerName: obs.sellerName,
          description: obs.description,
          observedAt: Number.isNaN(observedAt.getTime()) ? now : observedAt,
        });
        listingResults.push(result);
        if (result.action === 'skipped') skippedCount += 1;
      } else {
        const parsed = legacyObservationSchema.safeParse(raw);
        if (!parsed.success) {
          skippedCount += 1;
          continue;
        }
        legacyDocs.push({
          productName: parsed.data.name,
          observedPrice: parsed.data.price,
          currency: parsed.data.currency.trim().toUpperCase(),
          source: 'facebook-browse',
          description: parsed.data.description,
          timestamp: now,
        });
      }
    }

    if (legacyDocs.length === 0 && listingResults.length === 0) {
      return res.status(400).json({ error: 'No valid observations' });
    }

    const savedLegacy =
      legacyDocs.length > 0 ? await recordObservations(legacyDocs) : 0;

    res.json({
      success: true,
      saved: savedLegacy,
      processed: listingResults.length,
      skipped: skippedCount,
      details: listingResults,
    });
  } catch (err) {
    next(err);
  }
});
