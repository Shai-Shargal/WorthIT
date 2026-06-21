import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/User.js';

export interface GoogleTokenPayload {
  email: string;
  sub: string;
  picture?: string;
  name?: string;
}

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

import { TIER_LIMITS, isNewMonth } from '../config/tierLimits.js';

function getGoogleClient(): OAuth2Client {
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
}


export async function verifyGoogleToken(googleToken: string): Promise<GoogleTokenPayload> {
  try {
    const ticket = await getGoogleClient().verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) throw new Error('No payload in Google token');
    if (!payload.email || !payload.sub) throw new Error('Missing email or sub in Google token');

    return {
      email: payload.email,
      sub: payload.sub,
      picture: payload.picture,
      name: payload.name,
    };
  } catch (err) {
    throw new Error(`Invalid Google token: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

export function generateJWT(userId: string, email: string, tier: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET not set or too short (min 32 chars)');
  }

  return jwt.sign(
    { userId, email, tier, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 },
    secret,
  );
}

export function verifyJWT(token: string): { userId: string; email: string; tier: string } {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');

  try {
    return jwt.verify(token, secret) as { userId: string; email: string; tier: string };
  } catch (err) {
    throw new Error(`Invalid JWT: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
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
