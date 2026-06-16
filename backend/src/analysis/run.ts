import type { AnalyzeProductResponse, ListingSnapshot, ProductInput } from '../../../shared/types/index.js';
import { analyzeCondition } from '../ai/condition.js';
import { generateNarrative } from '../ai/narrative.js';
import { getCachedAnalysis, listingFingerprint, setCachedAnalysis } from '../cache/analysisCache.js';
import { buildMarketContexts } from '../marketplace/marketContext.js';
import { recordObservations } from '../marketplace/marketObservations.js';
import { buildAnalysisId, saveAnalysis } from './analysisRepository.js';
import { computeVerdict } from './verdict.js';

function normalizeCurrency(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (upper === 'NIS' || upper === '₪') return 'ILS';
  return upper.slice(0, 8);
}

export function productToListing(product: ProductInput): ListingSnapshot {
  return {
    title: product.title.trim(),
    price: product.price,
    currency: normalizeCurrency(product.currency),
    description: product.description,
    imageUrl: product.image,
    url: product.url,
    observedAt: new Date(),
  };
}

export async function runProductAnalysis(product: ProductInput): Promise<AnalyzeProductResponse> {
  const listing = productToListing(product);
  const cacheKey = listingFingerprint(listing);

  const cached = getCachedAnalysis(cacheKey);
  if (cached) return cached;

  const { localMarketContext, historicalContext } = await buildMarketContexts({
    name: listing.title,
    currency: listing.currency,
  });

  const condition = await analyzeCondition({
    title: listing.title,
    description: listing.description,
    imageUrl: listing.imageUrl,
  });

  const verdict = computeVerdict({ listing, localMarketContext });

  const reasoning = await generateNarrative({
    listing,
    localMarketContext,
    historicalContext,
    verdict,
    condition,
  });

  const response: AnalyzeProductResponse = {
    analysisId: buildAnalysisId(),
    listing,
    localMarketContext,
    historicalContext,
    verdict,
    reasoning,
  };

  setCachedAnalysis(cacheKey, response);
  void saveAnalysis(response.analysisId, response);
  void recordObservations([
    {
      productName: listing.title,
      observedPrice: listing.price,
      currency: listing.currency,
      source: listing.source ?? 'unknown',
      timestamp: listing.observedAt,
    },
  ]);
  return response;
}
