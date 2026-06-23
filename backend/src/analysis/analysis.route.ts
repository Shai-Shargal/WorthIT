import { Router, type Response } from 'express';
import { saveAnalysis } from './analysisRepository.js';
import { runProductAnalysis } from './run.js';
import { checkQuotaAndIncrement } from '../services/quotaService.js';
import { findOrCreateProduct, updateProductAnalysisHistory } from '../services/productService.js';
import { getAllRedFlags } from '../services/fraudDetection.js';
import { AnalysisModel, type AnalysisDoc } from '../database/models/Analysis.js';
import { isMongoReady } from '../database/mongoose.js';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { productSchema } from './productSchema.js';

export const analysisRouter = Router();

// POST /analyze — open during pre-PMF algorithm iteration. Quota and analysis
// ownership are linked to the caller's userId when a valid Bearer token is
// present (via optionalAuth), but unauthenticated callers are accepted too so
// we can dogfood the algorithm without a sign-in flow.
analysisRouter.post('/analyze', optionalAuth, async (req: AuthenticatedRequest, res: Response, next) => {
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

    // Only enforce quota when we actually know who the caller is.
    let analysesRemaining: number | undefined;
    if (req.userId) {
      const quota = await checkQuotaAndIncrement(req.userId);
      if (!quota.allowed) {
        return res.status(402).json({
          error: quota.reason || 'Quota exceeded',
          analysesRemaining: 0,
        });
      }
      analysesRemaining = quota.analysesRemaining;
    }

    const productId = await findOrCreateProduct(parsed.data, 'facebook');
    const redFlags = getAllRedFlags(parsed.data);
    const result = await runProductAnalysis(parsed.data);

    void saveAnalysis(result.analysisId, result, req.userId, productId || undefined);

    if (productId && req.userId) {
      void updateProductAnalysisHistory(productId, {
        analysisId: result.analysisId,
        verdict: result.verdict.verdict,
        userId: req.userId,
        timestamp: new Date(),
      });
    }

    res.json({
      ...result,
      redFlags,
      ...(analysesRemaining !== undefined ? { analysesRemaining } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// GET /analysis/:id — retrieve single analysis (user-scoped)
analysisRouter.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    if (!isMongoReady()) {
      return res.status(503).json({ error: 'Storage unavailable' });
    }

    const doc = (await AnalysisModel.findOne({ analysisId: req.params.id }).lean().exec()) as AnalysisDoc | null;

    if (!doc) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    // Allow access if: user owns it, or analysis predates auth (userId not set)
    if (doc.userId && doc.userId.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to view this analysis' });
    }

    // Map doc to AnalyzeProductResponse shape
    const result = {
      analysisId: doc.analysisId,
      listing: doc.listing,
      verdict: doc.verdict,
      reasoning: doc.reasoning,
      localMarketContext: doc.marketData?.localMarketContext,
      historicalContext: doc.marketData?.historicalContext,
    };

    res.json(result);
  } catch (err) {
    next(err);
  }
});
