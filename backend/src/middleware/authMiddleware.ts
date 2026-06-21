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
