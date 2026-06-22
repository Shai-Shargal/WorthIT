import * as Sentry from '@sentry/node';
import type { Request, Response, NextFunction } from 'express';

export function initSentry(): void {
  if (!process.env.SENTRY_DSN) {
    console.warn('[sentry] SENTRY_DSN not set, error reporting disabled');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection(),
    ],
  });

  console.log('[sentry] initialized with DSN');
}

export function sentryRequestHandler(): ReturnType<typeof Sentry.Handlers.requestHandler> {
  return Sentry.Handlers.requestHandler();
}

export function sentryErrorHandler(): ReturnType<typeof Sentry.Handlers.errorHandler> {
  return Sentry.Handlers.errorHandler();
}

export function captureErrorContext(
  req: Request,
  err: unknown,
  context: Record<string, unknown> = {},
): void {
  if (!process.env.SENTRY_DSN) return;

  const message = err instanceof Error ? err.message : String(err);
  const userId = (req as any).userId;
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
        headers: {
          'user-agent': req.get('user-agent'),
        },
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
    tags: {
      event: 'auth_failure',
      endpoint: `${req.method} ${req.path}`,
    },
    contexts: {
      auth: { reason },
    },
  });
}

export function captureQuotaExceeded(userId: string, tier: string, endpoint: string): void {
  if (!process.env.SENTRY_DSN) return;

  Sentry.captureMessage('Quota exceeded', {
    level: 'info',
    tags: {
      event: 'quota_exceeded',
      tier,
      userId,
    },
    contexts: {
      quota: { endpoint },
    },
  });
}

export function captureAnalysisFailure(userId: string, reason: string): void {
  if (!process.env.SENTRY_DSN) return;

  Sentry.captureMessage(`Analysis failed: ${reason}`, {
    level: 'warning',
    tags: {
      event: 'analysis_failure',
      userId,
    },
    contexts: {
      analysis: { reason },
    },
  });
}
