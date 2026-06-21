import type { ProductSchemaInput } from '../analysis/productSchema.js';

interface RedFlag {
  category: 'seller' | 'price' | 'condition' | 'photo' | 'description';
  severity: 'caution' | 'warning' | 'high_risk';
  description: string;
}

const CATEGORY_BOUNDS: Record<string, { min: number; max: number; name: string }> = {
  phone:      { min: 500,   max: 8000,   name: 'Mobile Phone' },
  laptop:     { min: 2000,  max: 15000,  name: 'Laptop' },
  tablet:     { min: 1000,  max: 10000,  name: 'Tablet' },
  watch:      { min: 100,   max: 5000,   name: 'Watch' },
  camera:     { min: 500,   max: 20000,  name: 'Camera' },
  headphones: { min: 100,   max: 3000,   name: 'Headphones' },
  car:        { min: 20000, max: 500000, name: 'Car' },
  furniture:  { min: 100,   max: 20000,  name: 'Furniture' },
  clothing:   { min: 10,    max: 1000,   name: 'Clothing' },
  shoes:      { min: 20,    max: 800,    name: 'Shoes' },
  bicycle:    { min: 500,   max: 15000,  name: 'Bicycle' },
  gaming:     { min: 1000,  max: 20000,  name: 'Gaming Console' },
};

const STOCK_PHOTO_INDICATORS = [
  'unsplash', 'pexels', 'pixabay', 'shutterstock', 'gettyimages',
  'dreamstime', 'alamy', 'istock', 'depositphotos', 'freepik',
  'flaticon', 'canva',
];

// Explicit keyword lists per category — no substring-prefix tricks that cause
// false positives (e.g. 'car' matching 'carpet', 'cartoon', 'scar').
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  phone:      ['phone', 'iphone', 'samsung', 'pixel', 'xiaomi', 'oneplus', 'huawei', 'אייפון', 'סמסונג'],
  laptop:     ['laptop', 'macbook', 'notebook', 'chromebook', 'dell', 'lenovo', 'hp ', 'asus', 'מחשב נייד'],
  tablet:     ['tablet', 'ipad', 'surface', 'טאבלט'],
  watch:      ['watch', 'smartwatch', 'שעון'],
  camera:     ['camera', 'canon', 'nikon', 'fujifilm', 'gopro', 'מצלמה'],
  headphones: ['headphone', 'earphone', 'airpod', 'earbud', 'אוזניות'],
  car:        [' car ', 'vehicle', 'sedan', 'suv', 'רכב', 'מכונית', 'אוטו'],
  furniture:  ['furniture', 'sofa', 'couch', 'wardrobe', 'ספה', 'ארון', 'שולחן'],
  clothing:   ['clothing', 'shirt', 'jacket', 'dress', 'חולצה', 'מעיל'],
  shoes:      ['shoe', 'sneaker', 'boot', 'sandal', 'נעל', 'נעליים'],
  bicycle:    ['bicycle', ' bike ', 'cycling', 'אופניים'],
  gaming:     ['gaming', 'playstation', 'xbox', 'nintendo', 'ps4', 'ps5', 'משחקים'],
};

export function guessCategory(title: string, description?: string): string | null {
  const text = (title + ' ' + (description ?? '')).toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return category;
  }
  return null;
}

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

  const urgencyKeywords = [
    'urgent', 'asap', 'hurry', 'limited time', 'last one',
    'must sell', 'price drop', 'final offer', 'ends today',
  ];

  const descLower = description.toLowerCase();
  const found = urgencyKeywords.filter((kw) => descLower.includes(kw));

  if (found.length >= 2) {
    return {
      category: 'description',
      severity: 'caution',
      description: `High-pressure language detected: ${found.join(', ')}. Seller may be rushing sale.`,
    };
  }

  return null;
}

const CATEGORY_ACCESSORIES: Record<string, string[]> = {
  phone:      ['charger', 'cable', 'box'],
  laptop:     ['charger', 'cable', 'bag'],
  camera:     ['lens', 'battery', 'tripod'],
  headphones: ['case', 'cable', 'box'],
};

export function detectMissingAccessories(title: string, description?: string): RedFlag | null {
  // Use guessCategory so MacBook, Galaxy, etc. are correctly identified
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
