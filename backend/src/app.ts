import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { analysisRouter } from './analysis/analysis.route.js';
import { authRouter } from './auth/auth.route.js';
import { marketplaceRouter } from './marketplace/marketplace.route.js';
import { mongoStatus } from './database/mongoose.js';
import { userRouter } from './user/user.route.js';

export function createApp(): Application {
  const app = express();

  // Allow all origins by default (Chrome extension uses chrome-extension:// origin).
  // Lock down with CORS_ORIGIN env var in production.
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : null;

  app.use(
    cors({
      origin: allowedOrigins ?? true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

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

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const statusFromErr = (err as { status?: number })?.status;
    const status =
      typeof statusFromErr === 'number' && statusFromErr >= 400 && statusFromErr < 600
        ? statusFromErr
        : 500;
    if (status >= 500) {
      console.error('[worthit-backend] unhandled error:', err);
    }
    res.status(status).json({ error: message });
  });

  return app;
}
