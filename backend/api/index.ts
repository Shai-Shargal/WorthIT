/**
 * Vercel serverless entrypoint.
 *
 * @vercel/node bundles this file + all imports at deploy time — no tsc step
 * needed. dotenv is intentionally omitted: Vercel injects env vars directly.
 *
 * MongoDB: connectMongo() is awaited on every request BEFORE Express handles
 * it, so warm containers that failed their initial connect (cold-start timing,
 * Atlas IP not yet propagated) recover automatically. connectMongo() is
 * idempotent — it short-circuits when readyState === 1, so connected
 * containers pay no extra cost.
 */
import type { Request, Response } from 'express';
import { createApp } from '../src/app.js';
import { connectMongo } from '../src/database/mongoose.js';
import { initSentry } from '../src/config/sentry.js';

initSentry();
const app = createApp();

export default async function handler(req: Request, res: Response): Promise<void> {
  await connectMongo();
  app(req, res);
}
