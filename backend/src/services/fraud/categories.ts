export const CATEGORY_BOUNDS: Record<string, { min: number; max: number; name: string }> = {
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

export const CATEGORY_ACCESSORIES: Record<string, string[]> = {
  phone:      ['charger', 'cable', 'box'],
  laptop:     ['charger', 'cable', 'bag'],
  camera:     ['lens', 'battery', 'tripod'],
  headphones: ['case', 'cable', 'box'],
};

// Explicit keyword lists — no substring-prefix tricks that cause false positives
// (e.g. 'car' matching 'carpet', 'cartoon', 'scar').
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
