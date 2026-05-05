import 'dotenv/config';
import { createApp } from './app.js';
import { connectMongo } from './db/mongoose.js';

const port = Number(process.env.PORT) || 4000;

await connectMongo();

const app = createApp();

app.listen(port, () => {
  console.log(`[worthit-backend] listening on http://localhost:${port}`);
});
