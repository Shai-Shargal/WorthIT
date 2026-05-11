import type { AiEvaluation, ListingSnapshot, LocalMarketContext } from '../types.js';

export type ListingSource = 'facebook' | 'yad2';

export interface Listing {
  id: string;
  title: string;
  price: number;
  source: ListingSource;
  currency?: string;
  url?: string;
  image?: string;
  location?: string;
  extractedAt: Date;
}

export interface AnalyzedListing extends Listing {
  listing: ListingSnapshot;
  localMarketContext: LocalMarketContext;
  aiEvaluation: AiEvaluation;
}
