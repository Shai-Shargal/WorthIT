import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/authMiddleware.js';
import { UserModel } from '../../models/User.js';
import { TIER_LIMITS } from '../../config/tierLimits.js';

export async function getMeHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: (err?: unknown) => void,
): Promise<void> {
  try {
    const user = await UserModel.findById(req.userId!).exec();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
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
}
