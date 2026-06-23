import * as Sentry from '@sentry/node';

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
