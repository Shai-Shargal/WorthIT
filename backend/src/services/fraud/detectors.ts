import type { ProductSchemaInput } from '../../analysis/productSchema.js';
import { CATEGORY_BOUNDS, CATEGORY_ACCESSORIES, guessCategory } from './categories.js';

export interface RedFlag {
  category: 'seller' | 'price' | 'condition' | 'photo' | 'description';
  severity: 'caution' | 'warning' | 'high_risk';
  description: string;
}

const STOCK_PHOTO_INDICATORS = [
  'unsplash', 'pexels', 'pixabay', 'shutterstock', 'gettyimages',
  'dreamstime', 'alamy', 'istock', 'depositphotos', 'freepik',
  'flaticon', 'canva',
];

const URGENCY_KEYWORDS = [
  'urgent', 'asap', 'hurry', 'limited time', 'last one',
  'must sell', 'price drop', 'final offer', 'ends today',
];

export function detectPriceSanity(listing: ProductSchemaInput): RedFlag | null {
  const category = guessCategory(listing.title, listing.description);
  if (!category) return null;

  const bounds = CATEGORY_BOUNDS[category];
  if (!bounds) return null;

  if (listing.price < bounds.min * 0.3) {
    return {
      category: 'price',
      severity: 'warning',
      description: `Price (${listing.currency} ${listing.price}) is unusually low for ${bounds.name} (typical: ${bounds.min}–${bounds.max})`,
    };
  }

  if (listing.price > bounds.max * 2) {
    return {
      category: 'price',
      severity: 'warning',
      description: `Price (${listing.currency} ${listing.price}) is unusually high for ${bounds.name} (typical: ${bounds.min}–${bounds.max})`,
    };
  }

  return null;
}

export function detectStockPhoto(listing: ProductSchemaInput): RedFlag | null {
  if (!listing.image) return null;
  const imageUrl = listing.image.toLowerCase();
  for (const indicator of STOCK_PHOTO_INDICATORS) {
    if (imageUrl.includes(indicator)) {
      return {
        category: 'photo',
        severity: 'high_risk',
        description: `Image appears to be from stock photo service (${indicator}). Likely not actual product photo.`,
      };
    }
  }
  return null;
}

export function detectUrgencyLanguage(description?: string): RedFlag | null {
  if (!description) return null;
  const descLower = description.toLowerCase();
  const found = URGENCY_KEYWORDS.filter((kw) => descLower.includes(kw));
  if (found.length >= 2) {
    return {
      category: 'description',
      severity: 'caution',
      description: `High-pressure language detected: ${found.join(', ')}. Seller may be rushing sale.`,
    };
  }
  return null;
}

export function detectMissingAccessories(title: string, description?: string): RedFlag | null {
  const category = guessCategory(title, description);
  if (!category) return null;

  const accessories = CATEGORY_ACCESSORIES[category];
  if (!accessories) return null;

  const fullText = (title + ' ' + (description ?? '')).toLowerCase();
  const missingCount = accessories.filter((kw) => !fullText.includes(kw)).length;

  if (missingCount >= 2) {
    return {
      category: 'condition',
      severity: 'caution',
      description: `${CATEGORY_BOUNDS[category]?.name ?? category} may be missing common accessories (${accessories.join(', ')}). Ask seller before buying.`,
    };
  }

  return null;
}

export function getAllRedFlags(listing: ProductSchemaInput): RedFlag[] {
  return [
    detectPriceSanity(listing),
    detectStockPhoto(listing),
    detectUrgencyLanguage(listing.description),
    detectMissingAccessories(listing.title, listing.description),
  ].filter((f): f is RedFlag => f !== null);
}
