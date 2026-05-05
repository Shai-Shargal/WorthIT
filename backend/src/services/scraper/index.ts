import type { Listing } from '../../types/listing.js';
import { scrapeFacebook } from './facebook.js';
import { scrapeYad2 } from './yad2.js';

export async function fetchListings(query: string): Promise<Listing[]> {
  const [facebook, yad2] = await Promise.all([
    scrapeFacebook(query).catch((err) => {
      console.error('[scraper:facebook] failed:', err);
      return [] as Listing[];
    }),
    scrapeYad2(query).catch((err) => {
      console.error('[scraper:yad2] failed:', err);
      return [] as Listing[];
    }),
  ]);

  return [...facebook, ...yad2];
}
