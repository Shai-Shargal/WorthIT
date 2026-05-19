import mongoose from 'mongoose';
import { MarketObservationModel } from '../database/models/MarketObservation.js';
import type { MarketObservation } from '../../../shared/types/index.js';

export interface ObservationQuery {
  name: string;
  currency?: string;
  sinceDays?: number;
  olderThanDays?: number;
  limit?: number;
}

function isMongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

function toKeywords(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function daysAgo(days: number): Date {
  const ms = Math.max(0, days) * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms);
}

function docToObservation(doc: unknown): MarketObservation {
  const raw = doc as {
    productName: string;
    observedPrice: number;
    currency: string;
    source: string;
    condition?: string;
    location?: string;
    timestamp: Date;
  };
  return {
    productName: raw.productName,
    observedPrice: raw.observedPrice,
    currency: raw.currency,
    source: raw.source,
    condition: raw.condition,
    location: raw.location,
    timestamp: raw.timestamp instanceof Date ? raw.timestamp : new Date(raw.timestamp),
  };
}

export async function recordObservations(observations: MarketObservation[]): Promise<number> {
  if (!isMongoReady() || observations.length === 0) return 0;

  const docs = observations.map((obs) => ({
    productName: obs.productName,
    productNameLower: obs.productName.toLowerCase(),
    observedPrice: obs.observedPrice,
    currency: obs.currency.toUpperCase(),
    source: obs.source,
    condition: obs.condition,
    location: obs.location,
    timestamp: obs.timestamp ?? new Date(),
  }));

  try {
    const inserted = await MarketObservationModel.insertMany(docs, { ordered: false });
    return inserted.length;
  } catch (err) {
    console.error('[marketObservations] insertMany failed:', err instanceof Error ? err.message : err);
    return 0;
  }
}

export async function findSimilarObservations(query: ObservationQuery): Promise<MarketObservation[]> {
  if (!isMongoReady()) return [];

  const keywords = toKeywords(query.name);
  if (keywords.length === 0) return [];

  const filter: Record<string, unknown> = {
    $and: keywords.map((kw) => ({
      productNameLower: { $regex: escapeRegex(kw) },
    })),
  };

  if (query.currency) {
    filter.currency = query.currency.toUpperCase();
  }

  const ts: Record<string, Date> = {};
  if (typeof query.sinceDays === 'number') {
    ts.$gte = daysAgo(query.sinceDays);
  }
  if (typeof query.olderThanDays === 'number') {
    ts.$lt = daysAgo(query.olderThanDays);
  }
  if (Object.keys(ts).length > 0) {
    filter.timestamp = ts;
  }

  const limit = Math.max(1, Math.min(500, query.limit ?? 100));

  try {
    const docs = await MarketObservationModel.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.map(docToObservation);
  } catch (err) {
    console.error('[marketObservations] find failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
