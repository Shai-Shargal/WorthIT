import type { ConditionSummary, MarketStats, ScoreBreakdown, Verdict } from '../types.js';

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
  score: number;
  verdict: Verdict;
  breakdown: ScoreBreakdown;
  condition: ConditionSummary;
  /** Comparable market stats for THIS listing title (provider-specific sample). */
  comps: MarketStats;
}
