import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ANALYZE_PRODUCT_PATH } from '../../shared/constants/index.js';
import { analyzeProductRouter } from './analysis/analyzeProduct.route.js';
import { mongoStatus } from './database/mongoose.js';

export function createApp(): Application {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', db: mongoStatus() });
  });

  app.use(ANALYZE_PRODUCT_PATH, analyzeProductRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const statusFromErr = (err as { status?: number })?.status;
    const status = typeof statusFromErr === 'number' && statusFromErr >= 400 && statusFromErr < 600 ? statusFromErr : 500;
    if (status >= 500) {
      console.error('[worthit-backend] unhandled error:', err);
    }
    res.status(status).json({ error: message });
  });

  return app;
}
