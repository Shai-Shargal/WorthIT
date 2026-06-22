import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { UserModel } from '../models/User.js';
import { AnalysisModel } from '../database/models/Analysis.js';
import { UserFeedbackModel } from '../models/UserFeedback.js';
import { TIER_LIMITS } from '../config/tierLimits.js';

export const userRouter = Router();

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

// GET /user/analyses — returns paginated list of user's analyses
userRouter.get('/analyses', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const marketplace = req.query.marketplace as string | undefined;

    const query: Record<string, unknown> = { userId: req.userId! };
    if (marketplace) {
      query['listing.marketplace'] = marketplace;
    }

    const [analyses, total] = await Promise.all([
      AnalysisModel.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .lean()
        .exec(),
      AnalysisModel.countDocuments(query),
    ]);

    res.json({
      analyses,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (err) {
    next(err);
  }
});

// POST /user/feedback — save feedback on an analysis
userRouter.post('/feedback', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { analysisId, helpful, accuracy, notes } = req.body;

    if (typeof helpful !== 'boolean') {
      return res.status(400).json({ error: 'helpful must be boolean' });
    }

    if (accuracy !== undefined && (typeof accuracy !== 'number' || accuracy < 1 || accuracy > 5)) {
      return res.status(400).json({ error: 'accuracy must be 1-5' });
    }

    if (notes !== undefined && typeof notes !== 'string') {
      return res.status(400).json({ error: 'notes must be string' });
    }

    // Verify analysis exists and belongs to user
    const analysis = await AnalysisModel.findOne({
      analysisId,
      userId: req.userId!,
    }).exec();

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found or not owned by user' });
    }

    // Create feedback
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
