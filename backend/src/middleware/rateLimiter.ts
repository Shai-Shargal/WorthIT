import type { Request, Response, NextFunction } from 'express';

interface RateLimit {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimit>();

const REQUESTS_PER_MINUTE = 20;
const WINDOW_MS = 60 * 1000; // 1 minute

function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.socket.remoteAddress ?? 'unknown')
  );
}

export function resetStoreForTests(): void {
  store.clear();
}

export function rateLimiter(req: Request, res: Response, next: NextFunction): void | Response {
  // Only rate limit POST /analyze (exact match — avoids catching future /reanalyze etc.)
  if (req.method !== 'POST' || req.path !== '/analyze') {
    return next();
  }

  const ip = getClientIp(req);
  const now = Date.now();
  let limit = store.get(ip);

  // Reset if window expired
  if (!limit || now > limit.resetTime) {
    limit = {
      count: 0,
      resetTime: now + WINDOW_MS,
    };
    store.set(ip, limit);
  }

  limit.count++;

  // Add rate limit info to response headers
  res.setHeader('X-RateLimit-Limit', REQUESTS_PER_MINUTE);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, REQUESTS_PER_MINUTE - limit.count));
  res.setHeader('X-RateLimit-Reset', limit.resetTime);

  if (limit.count > REQUESTS_PER_MINUTE) {
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil((limit.resetTime - now) / 1000),
    });
  }

  next();
}

// Cleanup old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, limit] of store.entries()) {
    if (now > limit.resetTime + WINDOW_MS) {
      store.delete(ip);
    }
  }
}, 5 * 60 * 1000);
