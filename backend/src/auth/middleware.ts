import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type JwtPayload } from './jwt.js';

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    (req as AuthenticatedRequest).user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
