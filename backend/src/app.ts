import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { analyzeRouter } from './routes/analyze.js';
import { searchRouter } from './routes/search.js';
import { mongoStatus } from './db/mongoose.js';

export function createApp(): Application {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', db: mongoStatus() });
  });

  app.use('/analyze', analyzeRouter);
  app.use('/search', searchRouter);

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
