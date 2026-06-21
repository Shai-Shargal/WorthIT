import { Router, type Response } from 'express';
import { findAnalysisById, saveAnalysis } from './analysisRepository.js';
import { runProductAnalysis } from './run.js';
import { checkQuotaAndIncrement } from '../services/quotaService.js';
import { findOrCreateProduct, updateProductAnalysisHistory } from '../services/productService.js';
import { getAllRedFlags } from '../services/fraudDetection.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { productSchema } from './productSchema.js';

export const analysisRouter = Router();

// POST /analyze — requires auth, checks quota, creates product, links analysis
analysisRouter.post('/analyze', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
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

    // Check quota before running analysis
    const quota = await checkQuotaAndIncrement(req.userId!);
    if (!quota.allowed) {
      return res.status(402).json({
        error: quota.reason || 'Quota exceeded',
        analysesRemaining: 0,
      });
    }

    // Find or create product
    const productId = await findOrCreateProduct(parsed.data, 'facebook');

    // Detect fraud indicators
    const redFlags = getAllRedFlags(parsed.data);

    // Run analysis — result.analysisId is the single source of truth
    const result = await runProductAnalysis(parsed.data);

    // Save with userId + productId linking
    void saveAnalysis(result.analysisId, result, req.userId, productId || undefined);

    // Update product analysis history
    if (productId) {
      void updateProductAnalysisHistory(productId, {
        analysisId: result.analysisId,
        verdict: result.verdict.verdict,
        userId: req.userId!,
        timestamp: new Date(),
      });
    }

    res.json({
      ...result,
      redFlags,
      analysesRemaining: quota.analysesRemaining,
    });
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
