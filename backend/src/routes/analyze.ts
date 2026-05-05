import { Router } from 'express';
import { z } from 'zod';
import type { AnalyzeResponse } from '../types.js';
import { parseListing } from '../services/parser.js';
import { getMarketData } from '../services/marketData/index.js';
import { computeStats, removeOutliers } from '../services/statistics.js';
import { score } from '../services/scoring.js';
import { analyzeCondition } from '../services/condition.js';
import { computeFinalScore, finalVerdict } from '../services/finalScore.js';
import { explain } from '../services/explanation.js';

export const analyzeRouter = Router();

const analyzeBodySchema = z.object({
  input: z.string().min(1, 'input is required'),
});

analyzeRouter.post('/', async (req, res, next) => {
  try {
    const parsed = analyzeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.flatten().fieldErrors.input?.[0] ?? 'Invalid request body';
      return res.status(400).json({ error: message });
    }

    const listing = parseListing(parsed.data.input);
    const rawPrices = await getMarketData({ name: listing.name, currency: listing.currency });
    const cleaned = removeOutliers(rawPrices);

    if (cleaned.length === 0) {
      return res.status(503).json({
        error: 'Not enough comparable market data to evaluate this listing.',
      });
    }

    const market = computeStats(cleaned);
    const { score: priceScore } = score(listing.price, market.median);
    const condition = await analyzeCondition({
      title: listing.name,
      description: listing.raw,
    });
    const finalScore = computeFinalScore(priceScore, condition.conditionScore);
    const verdict = finalVerdict(finalScore);

    const breakdown = {
      priceScore,
      conditionScore: condition.conditionScore,
    };
    const conditionSummary = {
      label: condition.conditionLabel,
      signals: condition.signals,
    };

    const explanation = await explain({
      product: { name: listing.name, price: listing.price, currency: listing.currency },
      market,
      score: finalScore,
      verdict,
      breakdown,
      condition: conditionSummary,
    });

    const body: AnalyzeResponse = {
      product: {
        name: listing.name,
        price: listing.price,
        currency: listing.currency,
      },
      market,
      score: finalScore,
      verdict,
      breakdown,
      condition: conditionSummary,
      explanation,
    };

    res.json(body);
  } catch (err) {
    next(err);
  }
});
