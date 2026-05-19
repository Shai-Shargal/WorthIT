export type ListingSource = 'facebook' | 'yad2' | 'manual';

/** Normalized product payload from the extension DOM extractor. */
export interface ProductInput {
  title: string;
  price: number;
  currency: string;
  description?: string;
  url?: string;
  image?: string;
}

export interface ListingSnapshot {
  title: string;
  price: number;
  currency: string;
  description?: string;
  imageUrl?: string;
  url?: string;
  source?: ListingSource;
  observedAt: Date;
}
