import { Router } from 'express';
import { findAnalysisById } from './analysisRepository.js';
import { runProductAnalysis } from './run.js';
import { incrementUsage } from '../usage/usageTracker.js';
import { requireAuth } from '../auth/middleware.js';
import { productSchema } from './productSchema.js';

export const analysisRouter = Router();

analysisRouter.post('/analyze', requireAuth, async (req, res, next) => {
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
    incrementUsage();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

analysisRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await findAnalysisById(req.params.id);
    if (result === 'unavailable') {
      return res.status(503).json({ error: 'Storage unavailable' });
    }
    if (!result) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});
