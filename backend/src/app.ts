import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { analysisRouter } from './analysis/analysis.route.js';
import { authRouter } from './auth/auth.route.js';
import { marketplaceRouter } from './marketplace/marketplace.route.js';
import { mongoStatus } from './database/mongoose.js';
import { userRouter } from './user/user.route.js';
import { initSentry, sentryRequestHandler, sentryErrorHandler, captureErrorContext } from './config/sentry.js';
import { rateLimiter } from './middleware/rateLimiter.js';

export function createApp(): Application {
  const app = express();

  // Initialize Sentry for error tracking
  initSentry();

  // Sentry request handler must be first
  app.use(sentryRequestHandler());

  // CORS: require explicit allowlist in production
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : process.env.NODE_ENV === 'production'
      ? [] // No origins allowed in prod without explicit config
      : ['chrome-extension://', 'http://localhost:3000', 'http://localhost:5173']; // Dev defaults

  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  // Rate limiter for POST /analyze
  app.use(rateLimiter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', db: mongoStatus() });
  });
  app.use('/auth', authRouter);
  app.use('/analysis', analysisRouter);
  app.use('/marketplace', marketplaceRouter);
  app.use('/user', userRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
  });

  // Sentry error handler (must be before custom error handler)
  app.use(sentryErrorHandler());

  // Custom error handler
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const statusFromErr = (err as { status?: number })?.status;
    const status =
      typeof statusFromErr === 'number' && statusFromErr >= 400 && statusFromErr < 600
        ? statusFromErr
        : 500;

    if (status >= 500) {
      console.error('[worthit-backend] unhandled error:', err);
      captureErrorContext(req, err, { severity: 'error' });
    } else if (status >= 400) {
      console.warn('[worthit-backend] client error:', message);
    }

    res.status(status).json({ error: message });
  });

  return app;
}
