import jwt from 'jsonwebtoken';

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
