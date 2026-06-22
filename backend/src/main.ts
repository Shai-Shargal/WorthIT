import 'dotenv/config';
import { createApp } from './app.js';
import { connectMongo } from './database/mongoose.js';
import { initSentry } from './config/sentry.js';

async function main(): Promise<void> {
  const port = Number(process.env.PORT) || 4000;

  // Initialize once at process startup — not inside createApp()
  initSentry();

  await connectMongo();

  const app = createApp();

  app.listen(port, () => {
    console.log(`[worthit-backend] listening on http://localhost:${port}`);
  });
}

void main();
