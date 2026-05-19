import mongoose from 'mongoose';

let lastError: string | null = null;
let attempted = false;

export async function connectMongo(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  attempted = true;
  lastError = null;

  if (!mongoUri) {
    lastError = 'Missing MONGO_URI env var';
    return;
  }

  try {
    if (mongoose.connection.readyState === 1) return;

    mongoose.set('strictQuery', false);

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 3000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown MongoDB error';
    lastError = message;
  }
}

export function mongoStatus() {
  if (!attempted) {
    return { connected: false, error: 'Mongo connection not attempted yet' };
  }

  const connected = mongoose.connection.readyState === 1;

  return {
    connected,
    error: connected ? null : lastError,
  };
}
