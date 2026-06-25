/**
 * Vercel serverless entrypoint.
 *
 * @vercel/node bundles this file + all imports at deploy time — no tsc step
 * needed. dotenv is intentionally omitted: Vercel injects env vars directly.
 *
 * MongoDB: connectMongo() is called on every request so warm containers that
 * failed their initial connect attempt (e.g. Atlas IP not yet whitelisted at
 * cold-start time) will reconnect automatically. connectMongo() short-circuits
 * when readyState === 1, so connected containers pay no extra cost.
 */
import type { Request, Response, NextFunction } from 'express';
import { createApp } from '../src/app.js';
import { connectMongo, isMongoReady } from '../src/database/mongoose.js';
import { initSentry } from '../src/config/sentry.js';

initSentry();

const app = createApp();

// Reconnect middleware: if the connection dropped or never established, retry
// before each request. No-op when already connected.
app.use((_req: Request, _res: Response, next: NextFunction) => {
  if (!isMongoReady()) {
    connectMongo().then(next).catch(next);
  } else {
    next();
  }
});

export default app;
