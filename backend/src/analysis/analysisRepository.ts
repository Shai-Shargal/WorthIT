import { randomUUID } from 'node:crypto';
import { AnalysisModel } from '../database/models/Analysis.js';
import { isMongoReady } from '../database/mongoose.js';
import type { AnalyzeProductResponse } from '../../../shared/types/index.js';

export function buildAnalysisId(): string {
  return randomUUID();
}

export async function saveAnalysis(id: string, result: AnalyzeProductResponse): Promise<void> {
  if (!isMongoReady()) return;
  try {
    await AnalysisModel.updateOne(
      { analysisId: id },
      {
        $set: {
          analysisId: id,
          listing: result.listing,
          verdict: result.verdict,
          reasoning: result.reasoning,
          localMarketContext: result.localMarketContext,
          historicalContext: result.historicalContext,
        },
      },
      { upsert: true },
    );
  } catch (err) {
    console.error('[analysisRepository] save failed:', err instanceof Error ? err.message : err);
  }
}

export async function findAnalysisById(id: string): Promise<AnalyzeProductResponse | null | 'unavailable'> {
  if (!isMongoReady()) return 'unavailable';
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
    return 'unavailable';
  }
}
