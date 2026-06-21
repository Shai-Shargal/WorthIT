import type { ProductSchemaInput } from '../analysis/productSchema.js';

interface RedFlag {
  category: 'seller' | 'price' | 'condition' | 'photo' | 'description';
  severity: 'caution' | 'warning' | 'high_risk';
  description: string;
}

// Typical price ranges for common product categories (in ILS)
const CATEGORY_BOUNDS: Record<string, { min: number; max: number; name: string }> = {
  phone: { min: 500, max: 8000, name: 'Mobile Phone' },
  laptop: { min: 2000, max: 15000, name: 'Laptop' },
  tablet: { min: 1000, max: 10000, name: 'Tablet' },
  watch: { min: 100, max: 5000, name: 'Watch' },
  camera: { min: 500, max: 20000, name: 'Camera' },
  headphones: { min: 100, max: 3000, name: 'Headphones' },
  car: { min: 20000, max: 500000, name: 'Car' },
  furniture: { min: 100, max: 20000, name: 'Furniture' },
  clothing: { min: 10, max: 1000, name: 'Clothing' },
  shoes: { min: 20, max: 800, name: 'Shoes' },
  bicycle: { min: 500, max: 15000, name: 'Bicycle' },
  gaming: { min: 1000, max: 20000, name: 'Gaming Console' },
};

const STOCK_PHOTO_INDICATORS = [
  'unsplash',
  'pexels',
  'pixabay',
  'shutterstock',
  'gettyimages',
  'dreamstime',
  'alamy',
  'istock',
  'depositphotos',
  'freepik',
  'flaticon',
  'canva',
];

function guessCategory(title: string, description?: string): string | null {
  const text = (title + ' ' + (description || '')).toLowerCase();

  for (const [category, _] of Object.entries(CATEGORY_BOUNDS)) {
    if (text.includes(category) || text.includes(category.slice(0, 4))) {
      return category;
    }
  }

  // Fallback category guessing
  if (text.includes('iphone') || text.includes('samsung') || text.includes('pixel')) return 'phone';
  if (text.includes('macbook') || text.includes('dell') || text.includes('hp')) return 'laptop';
  if (text.includes('ipad') || text.includes('surface')) return 'tablet';
  if (text.includes('sony') || text.includes('canon') || text.includes('nikon')) return 'camera';

  return null;
}

export function detectPriceSanity(listing: ProductSchemaInput): RedFlag | null {
  const category = guessCategory(listing.title, listing.description);
  if (!category) return null; // Can't guess category, no red flag

  const bounds = CATEGORY_BOUNDS[category];
  if (!bounds) return null;

  const price = listing.price;

  // If price is significantly below minimum
  if (price < bounds.min * 0.3) {
    return {
      category: 'price',
      severity: 'warning',
      description: `Price (${listing.currency} ${price}) is unusually low for ${bounds.name} (typical: ${bounds.min}-${bounds.max})`,
    };
  }

  // If price is significantly above maximum
  if (price > bounds.max * 2) {
    return {
      category: 'price',
      severity: 'warning',
      description: `Price (${listing.currency} ${price}) is unusually high for ${bounds.name} (typical: ${bounds.min}-${bounds.max})`,
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
    'urgent',
    'asap',
    'hurry',
    'limited time',
    'last one',
    'must sell',
    'price drop',
    'final offer',
    'ends today',
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

export function detectMissingAccessories(title: string, description?: string): RedFlag | null {
  const fullText = (title + ' ' + (description || '')).toLowerCase();

  // Products that should come with accessories
  const categoryAccessories: Record<string, { name: string; keywords: string[] }> = {
    phone: { name: 'phone', keywords: ['charger', 'cable', 'box'] },
    laptop: { name: 'laptop', keywords: ['charger', 'cable', 'bag'] },
    camera: { name: 'camera', keywords: ['lens', 'battery', 'tripod'] },
    headphones: { name: 'headphones', keywords: ['case', 'cable', 'box'] },
  };

  for (const [_, { name, keywords }] of Object.entries(categoryAccessories)) {
    if (fullText.includes(name)) {
      const missingCount = keywords.filter((kw) => !fullText.includes(kw)).length;
      if (missingCount >= 2) {
        return {
          category: 'condition',
          severity: 'caution',
          description: `${name} may be missing common accessories (${keywords.join(', ')}). Ask seller before buying.`,
        };
      }
    }
  }

  return null;
}

export function getAllRedFlags(listing: ProductSchemaInput): RedFlag[] {
  const flags: RedFlag[] = [];

  const priceSanity = detectPriceSanity(listing);
  if (priceSanity) flags.push(priceSanity);

  const stockPhoto = detectStockPhoto(listing);
  if (stockPhoto) flags.push(stockPhoto);

  const urgency = detectUrgencyLanguage(listing.description);
  if (urgency) flags.push(urgency);

  const accessories = detectMissingAccessories(listing.title, listing.description);
  if (accessories) flags.push(accessories);

  return flags;
}
