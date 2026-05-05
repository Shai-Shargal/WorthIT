import { Router } from 'express';
import { z } from 'zod';
import type { AnalyzedListing } from '../types/listing.js';
import { getMarketData } from '../services/marketData/index.js';
import { computeStats, removeOutliers } from '../services/statistics.js';
import { score } from '../services/scoring.js';
import { analyzeCondition } from '../services/condition.js';
import { computeFinalScore, finalVerdict } from '../services/finalScore.js';
import { withConcurrency } from '../services/concurrency.js';
import { makeListingId } from '../services/scraper/utils.js';
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

    const rowResults = await withConcurrency(jobs, PIPELINE_CONCURRENCY, async ({ listing, idx }) => {
      const currency = listingCurrency(defaultCurrency, listing.currency);
      const rawPrices = await getMarketData({ name: listing.title, currency });
      const cleaned = removeOutliers(rawPrices);
      const usable = cleaned.length > 0 ? cleaned : rawPrices;
      if (usable.length === 0) return null;

      const stats = computeStats(usable);
      const condition = await analyzeCondition({ title: listing.title, imageUrl: listing.image });

      const { score: priceScore } = score(listing.price, stats.median);
      const finalScore = computeFinalScore(priceScore, condition.conditionScore);
      const verdict = finalVerdict(finalScore);

      const enriched: AnalyzedListing = {
        id: makeListingId('facebook', listing.title, idx),
        title: listing.title,
        price: listing.price,
        currency,
        source: 'facebook',
        url: listing.url,
        image: listing.image,
        extractedAt: now,
        score: finalScore,
        verdict,
        breakdown: {
          priceScore,
          conditionScore: condition.conditionScore,
        },
        condition: {
          label: condition.conditionLabel,
          signals: condition.signals,
        },
        comps: {
          median: stats.median,
          mean: stats.mean,
          min: stats.min,
          max: stats.max,
          sampleSize: stats.sampleSize,
        },
      };

      return enriched;
    });

    const results = rowResults.filter((r): r is AnalyzedListing => r !== null).sort((a, b) => b.score - a.score);

    res.json({
      query: pageQuery,
      market: null,
      results,
    });
  } catch (err) {
    next(err);
  }
});
