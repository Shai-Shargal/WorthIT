import { Router } from 'express';
import { z } from 'zod';
import type { AnalyzeResponse, ListingSnapshot, MarketObservation, Recommendation } from '../types.js';
import { fetchListings } from '../services/scraper/index.js';
import { buildMarketContexts } from '../services/marketContext.js';
import { analyzeCondition } from '../services/condition.js';
import { evaluateListing } from '../services/aiEvaluation.js';
import { withConcurrency } from '../services/concurrency.js';
import { recordObservations } from '../services/marketObservations.js';

export const searchRouter = Router();

const querySchema = z.object({
  q: z.string().trim().min(1, 'q is required'),
});

const RECOMMENDATION_RANK: Record<Recommendation, number> = {
  worth_it: 0,
  maybe: 1,
  avoid: 2,
};

const PIPELINE_CONCURRENCY = 4;

searchRouter.get('/', async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      const message = parsed.error.flatten().fieldErrors.q?.[0] ?? 'Invalid query';
      return res.status(400).json({ error: message });
    }

    const { q } = parsed.data;
    const listings = await fetchListings(q);

    if (listings.length === 0) {
      return res.json({ query: q, results: [] });
    }

    const observations: MarketObservation[] = listings
      .filter((l) => Number.isFinite(l.price) && l.price > 0)
      .map((l) => ({
        productName: l.title,
        observedPrice: l.price,
        currency: (l.currency ?? 'ILS').toUpperCase(),
        source: l.source,
        location: l.location,
        timestamp: l.extractedAt ?? new Date(),
      }));

    await recordObservations(observations).catch((err) => {
      console.error('[search] failed to persist observations:', err instanceof Error ? err.message : err);
    });

    const rowResults = await withConcurrency(listings, PIPELINE_CONCURRENCY, async (l): Promise<AnalyzeResponse | null> => {
      const currency = (l.currency ?? 'ILS').toUpperCase();
      const snapshot: ListingSnapshot = {
        title: l.title,
        price: l.price,
        currency,
        imageUrl: l.image,
        url: l.url,
        source: l.source,
        observedAt: l.extractedAt ?? new Date(),
      };

      const { localMarketContext, historicalContext } = await buildMarketContexts({
        name: snapshot.title,
        currency,
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
      query: q,
      results,
    });
  } catch (err) {
    next(err);
  }
});
