import { Router } from 'express';
import { z } from 'zod';
import { runProductAnalysis } from './run.js';

export const analyzeProductRouter = Router();

const productSchema = z.object({
  title: z.string().trim().min(1).max(300),
  price: z.number().finite().positive(),
  currency: z.string().trim().min(1).max(8),
  description: z.string().trim().max(5000).optional(),
  url: z.string().url().optional(),
  image: z.string().url().optional(),
});

analyzeProductRouter.post('/', async (req, res, next) => {
  try {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const message =
        flat.fieldErrors.title?.[0] ??
        flat.fieldErrors.price?.[0] ??
        flat.fieldErrors.currency?.[0] ??
        flat.formErrors[0] ??
        'Invalid request body';
      return res.status(400).json({ error: message });
    }

    const result = await runProductAnalysis(parsed.data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
