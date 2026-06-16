import { Router } from 'express';
import { z } from 'zod';
import { findAnalysisById } from './analysisRepository.js';
import { runProductAnalysis } from './run.js';

export const analysisRouter = Router();

const productSchema = z.object({
  title: z.string().trim().min(1).max(300),
  price: z.number().finite().positive(),
  currency: z.string().trim().min(1).max(8),
  description: z.string().trim().max(5000).optional(),
  url: z.string().url().optional(),
  image: z.string().url().optional(),
});

analysisRouter.post('/analyze', async (req, res, next) => {
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

analysisRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await findAnalysisById(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});
