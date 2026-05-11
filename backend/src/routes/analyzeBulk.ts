import { Router } from 'express';
import { z } from 'zod';
import type { AnalyzeResponse, ListingSnapshot, Recommendation } from '../types.js';
import { buildMarketContexts } from '../services/marketContext.js';
import { analyzeCondition } from '../services/condition.js';
import { evaluateListing } from '../services/aiEvaluation.js';
import { withConcurrency } from '../services/concurrency.js';
import { looksLikeUiNoiseTitle } from '../services/listingTitleQuality.js';

export const analyzeBulkRouter = Router();

const bulkSchema = z.object({
  query: z.string().trim().max(120).optional(),
  currency: z.string().trim().min(1).max(8).default('USD'),
  listings: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        price: z.number().finite().positive(),
        currency: z.string().trim().min(1).max(8).optional(),
        url: z.string().url().optional(),
        image: z.string().url().optional(),
      }),
    )
    .min(1, 'at least one listing is required')
    .max(60, 'maximum 60 listings per request'),
});

/** Normalize currency hints from the FE (supports NIS / common typos). */
function listingCurrency(globalDefault: string, row?: string): string {
  const raw = (row ?? globalDefault).trim().toUpperCase();
  if (raw === 'NIS' || raw === '₪') return 'ILS';
  if (raw.startsWith('IL')) return raw.slice(0, 8);
  return raw.slice(0, 8);
}

const RECOMMENDATION_RANK: Record<Recommendation, number> = {
  worth_it: 0,
  maybe: 1,
  avoid: 2,
};

const PIPELINE_CONCURRENCY = 6;

analyzeBulkRouter.post('/', async (req, res, next) => {
  try {
    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const message =
        flat.fieldErrors.listings?.[0] ??
        flat.formErrors[0] ??
        flat.fieldErrors.currency?.[0] ??
        'Invalid request body';
      return res.status(400).json({ error: message });
    }

    const { listings } = parsed.data;
    const pageQuery = parsed.data.query?.trim() ?? '';
    const defaultCurrency = listingCurrency(parsed.data.currency);

    const jobs = listings
      .map((listing, idx) => ({ listing, idx }))
      .filter(({ listing }) => !looksLikeUiNoiseTitle(listing.title));

    const now = new Date();

    const rowResults = await withConcurrency(jobs, PIPELINE_CONCURRENCY, async ({ listing }): Promise<AnalyzeResponse | null> => {
      const currency = listingCurrency(defaultCurrency, listing.currency);

      const snapshot: ListingSnapshot = {
        title: listing.title,
        price: listing.price,
        currency,
        imageUrl: listing.image,
        url: listing.url,
        source: 'facebook',
        observedAt: now,
      };

      const { localMarketContext, historicalContext } = await buildMarketContexts({
        name: snapshot.title,
        currency: snapshot.currency,
      });

      if (localMarketContext.observationCount === 0 && historicalContext.totalObservations === 0) {
        return null;
      }

      const condition = await analyzeCondition({
        title: snapshot.title,
        imageUrl: snapshot.imageUrl,
      });

      const aiEvaluation = await evaluateListing({
        listing: snapshot,
        localMarketContext,
        historicalContext,
        condition,
      });

      return {
        listing: snapshot,
        localMarketContext,
        historicalContext,
        aiEvaluation,
      };
    });

    const results = rowResults
      .filter((r): r is AnalyzeResponse => r !== null)
      .sort((a, b) => {
        const rankDiff = RECOMMENDATION_RANK[a.aiEvaluation.recommendation] -
          RECOMMENDATION_RANK[b.aiEvaluation.recommendation];
        if (rankDiff !== 0) return rankDiff;
        return b.aiEvaluation.confidence - a.aiEvaluation.confidence;
      });

    res.json({
      query: pageQuery,
      results,
    });
  } catch (err) {
    next(err);
  }
});
