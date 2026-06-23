import * as Sentry from '@sentry/node';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../../middleware/authMiddleware.js';

export function captureErrorContext(
  req: Request,
  err: unknown,
  context: Record<string, unknown> = {},
): void {
  if (!process.env.SENTRY_DSN) return;

  const userId = (req as AuthenticatedRequest).userId;
  const path = req.path;
  const method = req.method;

  Sentry.captureException(err, {
    tags: {
      endpoint: `${method} ${path}`,
      ...(userId && { userId }),
    },
    contexts: {
      request: {
        url: req.url,
        method,
        headers: { 'user-agent': req.get('user-agent') },
      },
      ...context,
    },
    level: 'error',
  });
}

export function captureAuthFailure(req: Request, reason: string): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureMessage(`Auth failure: ${reason}`, {
    level: 'warning',
    tags: { event: 'auth_failure', endpoint: `${req.method} ${req.path}` },
    contexts: { auth: { reason } },
  });
}

export function captureQuotaExceeded(userId: string, tier: string, endpoint: string): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureMessage('Quota exceeded', {
    level: 'info',
    tags: { event: 'quota_exceeded', tier, userId },
    contexts: { quota: { endpoint } },
  });
}

export function captureAnalysisFailure(userId: string, reason: string): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureMessage(`Analysis failed: ${reason}`, {
    level: 'warning',
    tags: { event: 'analysis_failure', userId },
    contexts: { analysis: { reason } },
  });
}
