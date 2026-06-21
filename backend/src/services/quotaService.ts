import { UserModel } from '../models/User.js';
import { UsageLogModel } from '../models/UsageLog.js';
import { TIER_LIMITS, isNewMonth } from '../config/tierLimits.js';

function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function checkQuotaAndIncrement(userId: string): Promise<{
  allowed: boolean;
  analysesRemaining: number;
  reason?: string;
}> {
  const user = await UserModel.findById(userId);
  if (!user) {
    return { allowed: false, analysesRemaining: 0, reason: 'User not found' };
  }

  // Trial active → allow, bypass quota
  if (user.trialExpiresAt && new Date() < user.trialExpiresAt) {
    return { allowed: true, analysesRemaining: TIER_LIMITS[user.tier] ?? 15 };
  }

  const tierLimit = TIER_LIMITS[user.tier] ?? 15;
  const now = new Date();

  // Reset monthly counter atomically if month has rolled over
  if (user.monthStartDate && isNewMonth(user.monthStartDate as Date)) {
    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          analysesUsedThisMonth: 0,
          monthStartDate: new Date(now.getFullYear(), now.getMonth(), 1),
        },
      },
    );
  }

  // Atomic quota check + increment — prevents concurrent over-quota
  const updated = await UserModel.findOneAndUpdate(
    { _id: userId, analysesUsedThisMonth: { $lt: tierLimit } },
    { $inc: { analysesUsedThisMonth: 1 }, $set: { lastAnalysisAt: now } },
    { new: true },
  );

  if (!updated) {
    return {
      allowed: false,
      analysesRemaining: 0,
      reason: `Quota exceeded. Limit: ${tierLimit} analyses per month.`,
    };
  }

  // Append-only audit log
  await UsageLogModel.findOneAndUpdate(
    { userId, yearMonth: getCurrentYearMonth() },
    { $inc: { analysesUsed: 1 } },
    { upsert: true, new: true },
  );

  return { allowed: true, analysesRemaining: tierLimit - updated.analysesUsedThisMonth };
}

export async function getAnalysesRemaining(userId: string): Promise<number> {
  const user = await UserModel.findById(userId);
  if (!user) return 0;

  if (user.monthStartDate && isNewMonth(user.monthStartDate as Date)) {
    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          analysesUsedThisMonth: 0,
          monthStartDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    );
    return TIER_LIMITS[user.tier] ?? 15;
  }

  const tierLimit = TIER_LIMITS[user.tier] ?? 15;
  return Math.max(0, tierLimit - user.analysesUsedThisMonth);
}
