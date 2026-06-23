import { UserModel } from '../../models/User.js';
import { TIER_LIMITS, isNewMonth } from '../../config/tierLimits.js';
import { verifyGoogleToken } from './googleTokenVerifier.js';
import { generateJWT } from './jwtService.js';

export interface AuthResponse {
  token: string;
  user: {
    email: string;
    picture?: string;
    name?: string;
    tier: string;
    analysesRemaining: number;
    trialExpiresAt?: Date;
  };
}

export async function authenticateWithGoogle(googleToken: string): Promise<AuthResponse> {
  const payload = await verifyGoogleToken(googleToken);

  let user = await UserModel.findOne({ googleId: payload.sub });

  if (!user) {
    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + 7);
    user = new UserModel({
      email: payload.email,
      googleId: payload.sub,
      googlePicture: payload.picture,
      googleName: payload.name,
      tier: 'free',
      trialExpiresAt,
      analysesUsedThisMonth: 0,
    });
    await user.save();
  } else if (user.monthStartDate && isNewMonth(user.monthStartDate as Date)) {
    const now = new Date();
    user.analysesUsedThisMonth = 0;
    user.monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
    await user.save();
  }

  const token = generateJWT(user._id.toString(), user.email, user.tier);
  const limit = TIER_LIMITS[user.tier] ?? 0;
  const analysesRemaining = Math.max(0, limit - user.analysesUsedThisMonth);

  return {
    token,
    user: {
      email: user.email,
      picture: user.googlePicture,
      name: user.googleName,
      tier: user.tier,
      analysesRemaining,
      trialExpiresAt: user.trialExpiresAt,
    },
  };
}
