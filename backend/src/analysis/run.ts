import type { AnalyzeProductResponse, ListingSnapshot, ProductInput, EstimatedValueRange } from '../../../shared/types/index.js';
import { analyzeCondition } from '../ai/condition.js';
import { runAiAnalysis } from '../ai/aiAnalysis.js';
import { getCachedAnalysis, listingFingerprint, setCachedAnalysis } from '../cache/analysisCache.js';
import { gatherPrices } from '../marketplace/priceGathering.js';
import { recordObservations } from '../marketplace/marketObservations.js';
import { buildAnalysisId, saveAnalysis } from './analysisRepository.js';

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
    source: 'facebook',
    observedAt: new Date(),
  };
}

export async function runProductAnalysis(product: ProductInput): Promise<AnalyzeProductResponse> {
  const listing = productToListing(product);
  const cacheKey = listingFingerprint(listing);

  const cached = getCachedAnalysis(cacheKey);
  if (cached) return cached;

  const [priceData, condition] = await Promise.all([
    gatherPrices({ name: listing.title, currency: listing.currency }),
    analyzeCondition({ title: listing.title, description: listing.description, imageUrl: listing.imageUrl }),
  ]);

  const { verdict, reasoning } = await runAiAnalysis({
    listing,
    condition,
    recentObservations: priceData.recentObservations,
    sources: priceData.sources,
  });

  const priceRange = priceData.localMarketContext.priceRange;
  if (priceRange && priceData.recentObservations.length >= 3) {
    verdict.estimatedValue = {
      min: priceRange.min,
      max: priceRange.max,
      currency: listing.currency,
    };
  }

  const response: AnalyzeProductResponse = {
    analysisId: buildAnalysisId(),
    listing,
    localMarketContext: priceData.localMarketContext,
    historicalContext: priceData.historicalContext,
    verdict,
    reasoning,
  };

  setCachedAnalysis(cacheKey, response);
  void saveAnalysis(response.analysisId, response);
  void recordObservations([{
    productName: listing.title,
    observedPrice: listing.price,
    currency: listing.currency,
    source: listing.source ?? 'facebook',
    timestamp: listing.observedAt,
  }]);

  return response;
}
