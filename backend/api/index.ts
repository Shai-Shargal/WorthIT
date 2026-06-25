/**
 * Vercel serverless entrypoint.
 *
 * @vercel/node bundles this file + all imports at deploy time — no tsc step
 * needed. dotenv is intentionally omitted: Vercel injects env vars directly.
 *
 * MongoDB: connectMongo() is idempotent (skips if already connected), so it
 * is safe to call on every cold start. Warm containers reuse the connection.
 */
import { createApp } from '../src/app.js';
import { connectMongo } from '../src/database/mongoose.js';
import { initSentry } from '../src/config/sentry.js';

initSentry();
void connectMongo();

export default createApp();
