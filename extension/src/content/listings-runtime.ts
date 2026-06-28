import { extractListingsFromSearchPage } from '../marketplace/listingExtractor.js';

export function getListings() {
  return extractListingsFromSearchPage();
}
