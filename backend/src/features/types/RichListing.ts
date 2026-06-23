/**
 * Rich, multi-source listing produced by the Data Enrichment Orchestrator.
 *
 * Built from a {@link RawListing} (marketplace extractor output) plus
 * data from up to four additional sources (seller, market, competition,
 * trends). The shape of each source slot is intentionally permissive
 * (`null` when the source failed) so consumers must defensively check
 * availability — there is no fake "default seller" or "fake market."
 *
 * Tasks 7–11 will replace the mock source signatures below with their
 * concrete implementations. The orchestrator (Task 6) is responsible only
 * for assembling whatever those tasks return — it does not invent data.
 */

import type { Marketplace } from '../../marketplace/types/RawListing.js';
import type { DataQuality } from './DataQuality.js';

/**
 * Output of the product enhancer (Task 7).
 *
 * Mirrors the original listing fields, plus normalized condition/category
 * and source-level confidence. `condition` and `category` may be empty
 * strings when the enhancer cannot infer them.
 */
export interface ProductData {
  title: string;
  price: number;
  currency: string;
  condition: string;
  category: string;
  description: string;
  images: string[];
  postedDate?: Date;
  url: string;
  marketplace: Marketplace;
  redFlags?: string[];
  confidence: number;
}

/**
 * Output of the seller enricher (Task 8). `null` when enrichment failed
 * (Tavily down, no historical data, timeout, …).
 */
export interface SellerData {
  name: string;
  trustScore: number;
  trustFactors?: Record<string, unknown>;
  historicalListings?: number;
  redFlags?: string[];
  confidence: number;
}

/**
 * Output of the market context gatherer (Task 9). `null` when market data
 * could not be gathered (DB offline, no comparable listings, timeout).
 */
export interface MarketData {
  averagePrice?: number;
  medianPrice?: number;
  priceRange?: { min: number; max: number };
  sampleSize?: number;
  demand?: 'high' | 'medium' | 'low';
  redFlags?: string[];
  confidence: number;
}

/**
 * Output of competitive cross-marketplace analysis (Task 10). `null` when
 * cross-marketplace search failed or no comparable listings were found.
 */
export interface CompetitionData {
  crossMarketplaceListings?: Array<{
    marketplace: Marketplace;
    price: number;
    url: string;
  }>;
  arbitrageOpportunity?: {
    detected: boolean;
    deltaPercent?: number;
  };
  redFlags?: string[];
  confidence: number;
}

/**
 * Output of the trend analyzer (Task 11). `null` when historical data is
 * insufficient to compute trends.
 */
export interface TrendData {
  priceDirection?: 'rising' | 'stable' | 'falling';
  priceVelocityPercent?: number;
  seasonal?: {
    isSeasonal: boolean;
    peakMonths?: number[];
  };
  redFlags?: string[];
  confidence: number;
}

/**
 * Aggregated red flag buckets. Each source contributes to its own bucket;
 * `fraud` is a meta-bucket reserved for the verdict engine to populate
 * later. The orchestrator never invents fraud signals.
 */
export interface AggregatedRedFlags {
  listing: string[];
  seller: string[];
  market: string[];
  competition: string[];
  trends: string[];
  fraud: string[];
}

/**
 * The final, unified rich listing handed to the AI Verdict Engine.
 *
 * `product` is required because we only call the orchestrator after the
 * marketplace extractor succeeded. Every other slot is nullable so that a
 * single failing source never crashes the verdict pipeline — the verdict
 * engine just sees less data and must reflect that in its own confidence.
 */
export interface RichListing {
  product: ProductData;
  seller: SellerData | null;
  market: MarketData | null;
  competition: CompetitionData | null;
  trends: TrendData | null;
  redFlags: AggregatedRedFlags;
  dataQuality: DataQuality;
  confidenceOverall: number;
}
