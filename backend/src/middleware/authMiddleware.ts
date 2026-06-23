import type { NextFunction, Request, Response } from 'express';
import { verifyJWT } from '../services/googleAuth.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  email?: string;
  tier?: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7);

  try {
    const decoded = verifyJWT(token);
    req.userId = decoded.userId;
    req.email = decoded.email;
    req.tier = decoded.tier;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Soft-auth variant for routes that work fine with or without a user.
 * Populates `req.userId`/email/tier when a valid Bearer token is present,
 * silently passes through otherwise. Used for `/analyze` while the product
 * is pre-PMF — we want the algorithm flow to "just work" without any login
 * concept, but still link analyses to a user when auth lands.
 */
export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next();
    return;
  }
  try {
    const decoded = verifyJWT(header.slice(7));
    req.userId = decoded.userId;
    req.email = decoded.email;
    req.tier = decoded.tier;
  } catch {
    // Invalid token on an optional-auth route is silently ignored — the
    // request continues as anonymous instead of 401-ing.
  }
  next();
}
