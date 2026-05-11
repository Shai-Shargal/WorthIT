import { Router } from 'express';
import { z } from 'zod';
import type { AnalyzeResponse, ListingSnapshot } from '../types.js';
import { parseListing } from '../services/parser.js';
import { buildMarketContexts } from '../services/marketContext.js';
import { analyzeCondition } from '../services/condition.js';
import { evaluateListing } from '../services/aiEvaluation.js';

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

    const parsedListing = parseListing(parsed.data.input);

    const listing: ListingSnapshot = {
      title: parsedListing.name,
      price: parsedListing.price,
      currency: parsedListing.currency,
      description: parsedListing.raw,
      source: 'manual',
      observedAt: new Date(),
    };

    const { localMarketContext, historicalContext } = await buildMarketContexts({
      name: listing.title,
      currency: listing.currency,
    });

    const condition = await analyzeCondition({
      title: listing.title,
      description: listing.description,
    });

    const aiEvaluation = await evaluateListing({
      listing,
      localMarketContext,
      historicalContext,
      condition,
    });

    const body: AnalyzeResponse = {
      listing,
      localMarketContext,
      historicalContext,
      aiEvaluation,
    };

    res.json(body);
  } catch (err) {
    next(err);
  }
});
