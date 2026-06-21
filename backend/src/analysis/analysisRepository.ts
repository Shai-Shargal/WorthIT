import { randomUUID } from 'node:crypto';
import { AnalysisModel, type AnalysisDoc } from '../database/models/Analysis.js';
import { isMongoReady } from '../database/mongoose.js';
import type { AnalyzeProductResponse } from '../../../shared/types/index.js';

export function buildAnalysisId(): string {
  return randomUUID();
}

export async function saveAnalysis(
  id: string,
  result: AnalyzeProductResponse,
  userId?: string,
  productId?: string,
): Promise<void> {
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
          marketData: {
            localMarketContext: result.localMarketContext,
            historicalContext: result.historicalContext,
          },
          updatedAt: new Date(),
          ...(userId && { userId }),
          ...(productId && { productId }),
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
    const doc = (await AnalysisModel.findOne({ analysisId: id }).lean().exec()) as AnalysisDoc | null;
    if (!doc) return null;
    return {
      analysisId: doc.analysisId,
      listing: doc.listing,
      verdict: doc.verdict,
      reasoning: doc.reasoning,
      localMarketContext: doc.marketData?.localMarketContext,
      historicalContext: doc.marketData?.historicalContext,
    } as unknown as AnalyzeProductResponse;
  } catch (err) {
    console.error('[analysisRepository] findById failed:', err instanceof Error ? err.message : err);
    return 'unavailable';
  }
}
