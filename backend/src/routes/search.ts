import { Router } from 'express';
import { z } from 'zod';
import type { AnalyzedListing } from '../types/listing.js';
import { fetchListings } from '../services/scraper/index.js';
import { computeStats, removeOutliers } from '../services/statistics.js';
import { score } from '../services/scoring.js';
import { analyzeCondition } from '../services/condition.js';
import { computeFinalScore, finalVerdict } from '../services/finalScore.js';

export const searchRouter = Router();

const querySchema = z.object({
  q: z.string().trim().min(1, 'q is required'),
});

const CONDITION_CONCURRENCY = 4;

async function withConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}

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
      return res.json({ query: q, market: null, results: [] });
    }

    const prices = listings.map((l) => l.price).filter((p) => Number.isFinite(p) && p > 0);
    const cleaned = removeOutliers(prices);
    const usablePrices = cleaned.length > 0 ? cleaned : prices;
    const stats = computeStats(usablePrices);

    const conditions = await withConcurrency(listings, CONDITION_CONCURRENCY, (l) =>
      analyzeCondition({ title: l.title, imageUrl: l.image }),
    );

    const results: AnalyzedListing[] = listings
      .map((l, i) => {
        const condition = conditions[i];
        const { score: priceScore } = score(l.price, stats.median);
        const finalScore = computeFinalScore(priceScore, condition.conditionScore);
        const verdict = finalVerdict(finalScore);
        return {
          ...l,
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
        };
      })
      .sort((a, b) => b.score - a.score);

    res.json({
      query: q,
      market: {
        median: stats.median,
        average: stats.mean,
        min: stats.min,
        max: stats.max,
        sampleSize: stats.sampleSize,
      },
      results,
    });
  } catch (err) {
    next(err);
  }
});
