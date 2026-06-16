import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AnalysisModel } from '../database/models/Analysis.js';
import type { AnalyzeProductResponse } from '../../../shared/types/index.js';

function isMongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export function buildAnalysisId(): string {
  return randomUUID();
}

export async function saveAnalysis(id: string, result: AnalyzeProductResponse): Promise<void> {
  if (!isMongoReady()) return;
  try {
    await AnalysisModel.updateOne(
      { analysisId: id },
      {
        analysisId: id,
        listing: result.listing,
        verdict: result.verdict,
        reasoning: result.reasoning,
        localMarketContext: result.localMarketContext,
        historicalContext: result.historicalContext,
      },
      { upsert: true },
    );
  } catch (err) {
    console.error('[analysisRepository] save failed:', err instanceof Error ? err.message : err);
  }
}

export async function findAnalysisById(id: string): Promise<AnalyzeProductResponse | null> {
  if (!isMongoReady()) return null;
  try {
    const doc = await AnalysisModel.findOne({ analysisId: id }).lean().exec();
    if (!doc) return null;
    return {
      analysisId: doc.analysisId as string,
      listing: doc.listing as AnalyzeProductResponse['listing'],
      verdict: doc.verdict as AnalyzeProductResponse['verdict'],
      reasoning: doc.reasoning as AnalyzeProductResponse['reasoning'],
      localMarketContext: doc.localMarketContext as AnalyzeProductResponse['localMarketContext'],
      historicalContext: doc.historicalContext as AnalyzeProductResponse['historicalContext'],
    };
  } catch (err) {
    console.error('[analysisRepository] findById failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
