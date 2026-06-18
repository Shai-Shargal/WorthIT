import { Router } from 'express';
import { z } from 'zod';
import { recordObservations } from './marketObservations.js';

export const marketplaceRouter = Router();

const observationSchema = z.object({
  name: z.string().trim().min(1).max(300),
  price: z.number().finite().positive(),
  currency: z.string().trim().min(1).max(8),
  url: z.string().url().optional(),
});

const batchSchema = z.object({
  observations: z.array(observationSchema).min(1).max(50),
});

marketplaceRouter.post('/observe', async (req, res, next) => {
  try {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid observations payload' });
    }

    const now = new Date();
    const observations = parsed.data.observations.map((obs) => ({
      productName: obs.name,
      observedPrice: obs.price,
      currency: obs.currency.trim().toUpperCase(),
      source: 'facebook-browse' as const,
      timestamp: now,
    }));

    const saved = await recordObservations(observations);
    res.json({ saved });
  } catch (err) {
    next(err);
  }
});
