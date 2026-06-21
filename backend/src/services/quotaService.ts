import { UserModel } from '../models/User.js';
import { UsageLogModel } from '../models/UsageLog.js';

const TIER_LIMITS: Record<string, number> = {
  free: 15,
  pro: 100,
  enterprise: 999999,
};

function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isNewMonth(monthStartDate: Date): boolean {
  const now = new Date();
  return (
    now.getFullYear() > monthStartDate.getFullYear() ||
    now.getMonth() > monthStartDate.getMonth()
  );
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

  // Check if trial has expired
  if (user.trialExpiresAt && new Date() > user.trialExpiresAt) {
    user.trialExpiresAt = undefined;
  }

  // If trial is active, allow unlimited
  if (user.trialExpiresAt && new Date() < user.trialExpiresAt) {
    return { allowed: true, analysesRemaining: TIER_LIMITS[user.tier] ?? 15 };
  }

  // Check if it's a new month — reset counter if so
  if (user.monthStartDate && isNewMonth(user.monthStartDate)) {
    user.analysesUsedThisMonth = 0;
    user.monthStartDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    await user.save();
  }

  const tierLimit = TIER_LIMITS[user.tier] ?? 15;
  const remaining = tierLimit - user.analysesUsedThisMonth;

  if (remaining <= 0) {
    return {
      allowed: false,
      analysesRemaining: 0,
      reason: `Quota exceeded. Limit: ${tierLimit} analyses per month.`,
    };
  }

  // Increment usage
  user.analysesUsedThisMonth += 1;
  user.lastAnalysisAt = new Date();
  await user.save();

  // Log the usage
  const yearMonth = getCurrentYearMonth();
  await UsageLogModel.findOneAndUpdate(
    { userId, yearMonth },
    { $inc: { analysesUsed: 1 } },
    { upsert: true, new: true },
  );

  return { allowed: true, analysesRemaining: remaining - 1 };
}

export async function getAnalysesRemaining(userId: string): Promise<number> {
  const user = await UserModel.findById(userId);
  if (!user) return 0;

  // Reset if new month
  if (user.monthStartDate && isNewMonth(user.monthStartDate)) {
    user.analysesUsedThisMonth = 0;
    user.monthStartDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    await user.save();
  }

  const tierLimit = TIER_LIMITS[user.tier] ?? 15;
  return Math.max(0, tierLimit - user.analysesUsedThisMonth);
}
