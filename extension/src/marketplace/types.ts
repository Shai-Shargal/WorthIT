/**
 * A single observation captured passively from a marketplace search page.
 *
 * Used by the passive collection pipeline (Phase 2). The extension extracts
 * these from DOM, batches them, deduplicates client-side, and ships them to
 * the backend `/marketplace/observe` endpoint to build a real-world price
 * corpus for the AI verdict pipeline.
 *
 * Required fields are guaranteed to exist (we skip a listing entirely if any
 * of them are missing). Optional fields may be absent on Facebook's DOM and
 * are surfaced as `undefined` so they round-trip cleanly through JSON.
 */
export interface ObservedListing {
  marketplace: 'facebook';
  /** Numeric id parsed from `/marketplace/item/{id}`. */
  listingId: string;
  /** Canonical or relative URL pointing at the item page. */
  listingUrl: string;
  /** Human-readable title from the listing card. */
  title: string;
  /** Parsed numeric price (rounded). Negative price means "invalid". */
  price: number;
  /** ISO-4217-ish currency code. Currently always `'ILS'` for Facebook IL. */
  currency: string;
  /** Free-form location label (e.g. "Tel Aviv"). */
  location?: string;
  /** Primary image URL displayed on the card. */
  imageUrl?: string;
  /** Seller display name from the card. */
  sellerName?: string;
  /** The `?query=` parameter from the current marketplace search page. */
  searchQuery: string;
  /** Wall-clock timestamp when the extension first observed this listing. */
  observedAt: Date;
}
