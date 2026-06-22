import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { UserModel } from '../models/User.js';
import { AnalysisModel } from '../database/models/Analysis.js';
import { UserFeedbackModel } from '../models/UserFeedback.js';
import { TIER_LIMITS } from '../config/tierLimits.js';

export const userRouter = Router();

const VALID_MARKETPLACES = new Set(['facebook', 'yad2', 'ebay', 'amazon']);

// GET /user/me — returns current user profile with quota info
userRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const user = await UserModel.findById(req.userId!).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tierLimit = TIER_LIMITS[user.tier] ?? 15;
    const analysesRemaining = Math.max(0, tierLimit - user.analysesUsedThisMonth);

    res.json({
      id: user._id,
      email: user.email,
      tier: user.tier,
      analysesRemaining,
      trialExpiresAt: user.trialExpiresAt,
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

// GET /user/analyses — paginated list of user's analyses
userRouter.get('/analyses', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const marketplace = req.query.marketplace as string | undefined;

    // Validate marketplace against allowed enum — prevents NoSQL injection
    if (marketplace !== undefined && !VALID_MARKETPLACES.has(marketplace)) {
      return res.status(400).json({ error: `marketplace must be one of: ${[...VALID_MARKETPLACES].join(', ')}` });
    }

    const query: Record<string, unknown> = { userId: req.userId! };

    // Note: marketplace lives on Product, not Analysis.listing.
    // Filtering by marketplace requires a Product join — deferred to a future task.
    // For now the param is accepted but silently ignored to avoid breaking clients.

    const [analyses, total] = await Promise.all([
      AnalysisModel.find(query).sort({ createdAt: -1 }).limit(limit).skip(offset).lean().exec(),
      AnalysisModel.countDocuments(query),
    ]);

    res.json({ analyses, total, limit, offset, hasMore: offset + limit < total });
  } catch (err) {
    next(err);
  }
});

// POST /user/feedback — save feedback on an analysis
userRouter.post('/feedback', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { analysisId, helpful, accuracy, notes } = req.body;

    if (!analysisId || typeof analysisId !== 'string') {
      return res.status(400).json({ error: 'analysisId is required' });
    }

    if (typeof helpful !== 'boolean') {
      return res.status(400).json({ error: 'helpful must be boolean' });
    }

    if (accuracy !== undefined && (typeof accuracy !== 'number' || accuracy < 1 || accuracy > 5)) {
      return res.status(400).json({ error: 'accuracy must be 1-5' });
    }

    if (notes !== undefined && typeof notes !== 'string') {
      return res.status(400).json({ error: 'notes must be string' });
    }

    if (notes !== undefined && notes.length > 1000) {
      return res.status(400).json({ error: 'notes must be 1000 characters or fewer' });
    }

    const analysis = await AnalysisModel.findOne({
      analysisId,
      userId: req.userId!,
    }).exec();

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found or not owned by user' });
    }

    const feedback = new UserFeedbackModel({
      userId: req.userId!,
      analysisId: analysis._id,
      helpful,
      accuracy,
      notes,
    });

    await feedback.save();

    res.status(201).json({
      id: feedback._id,
      analysisId,
      helpful,
      accuracy,
      createdAt: feedback.createdAt,
    });
  } catch (err) {
    next(err);
  }
});
