import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getAnalysesRemaining } from '../services/quotaService.js';
import { UserModel } from '../models/User.js';

export const userRouter = Router();

// GET /user/me — returns current user profile with quota info
userRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const user = await UserModel.findById(req.userId!).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const analysesRemaining = await getAnalysesRemaining(req.userId!);

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
