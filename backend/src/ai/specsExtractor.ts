export interface ProductSpecs {
  ram?: string;
  storage?: string[];
  chipModel?: string;
  year?: string;
  missingItems: string[];
  redFlags: string[];
  summary: string; // formatted for AI prompt
}

const RAM_PATTERN = /(\d+)\s*(?:gb|גיגה|ג['׳]?יגה)\s*(?:ram|ראם|זיכרון)/gi;
// Negative lookahead excludes RAM context so "16GB RAM" doesn't appear as storage
const STORAGE_PATTERN = /(\d+)\s*(gb|tb|גיגה|טרה)(?!\s*(?:ram|ראם|זיכרון))[\s-]*(?:ssd|hdd|nvme|storage|אחסון|דיסק)?/gi;
// \w* after digits handles full Intel suffixes like G7, H, U in i7-1165G7
const CHIP_PATTERN = /\b(m[1-4](?:\s*(?:pro|max|ultra))?|i[3579][-\s]?\d{4,5}\w*|ryzen\s*[3579]|snapdragon\s*\d+)\b/gi;
const YEAR_PATTERN = /\b(20[12]\d)\b/g;

// Hebrew + English missing accessory signals
const MISSING_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /ללא\s*(?:מטען|charger|קופסה|אריזה|box)/i, label: 'No charger/box' },
  { pattern: /(?:no|without)\s*(?:charger|box|original\s*box)/i, label: 'No charger/box' },
  { pattern: /שלט\s*אחד|one\s*controller/i, label: 'Only one controller' },
  { pattern: /ללא\s*(?:שלט|controller)/i, label: 'No controller included' },
  { pattern: /מוכר\s*כפי\s*שהוא|as[\s-]is/i, label: 'Sold as-is' },
  { pattern: /(?:חסר|missing)\s*\S+/i, label: 'Missing accessories' },
];

// Red flag language signals
const RED_FLAG_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /חייב\s*(?:למכור|למכירה)|must\s*sell|urgent\s*sale/i, label: 'Urgent sale language' },
  { pattern: /(?:מכירה\s*)?דחופה|urgent/i, label: 'Urgency pressure' },
  { pattern: /לא\s*(?:בדקתי|בדוק|נבדק)|untested|not\s*tested/i, label: 'Untested / not verified' },
  { pattern: /(?:לא\s*)?(?:עובד|עולה|מדליק)\s*(?:לא|לא\s*תמיד)/i, label: 'Functional issues mentioned' },
  // \b only applied to ASCII words — Hebrew chars are non-\w in JS so \b never fires before them
  { pattern: /סדק|שבור|\b(?:broken|crack|shatter)\b/i, label: 'Physical damage mentioned' },
  { pattern: /(?:ללא|לא\s*כולל|לא\s*עם)\s*אחריות|no\s*warranty/i, label: 'No warranty' },
  { pattern: /(?:איפוס|reset)\s*(?:מ?ר?חוק|remote|factory)/i, label: 'Factory reset mentioned' },
  { pattern: /כנסו\s*לתיאור|see\s*description/i, label: 'Vague title — details hidden in description' },
];

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

export function extractSpecs(title: string, description?: string): ProductSpecs {
  const text = `${title} ${description ?? ''}`;

  // RAM
  const ramMatches = [...text.matchAll(RAM_PATTERN)];
  const ram = ramMatches.length > 0
    ? `${ramMatches[0][1]}GB RAM`
    : undefined;

  // Storage — deduplicated
  const storageMatches = [...text.matchAll(STORAGE_PATTERN)];
  const storage = storageMatches.length > 0
    ? dedupe(storageMatches.map((m) => {
        const num = parseInt(m[1], 10);
        const rawUnit = m[2].toLowerCase();
        const unit = rawUnit === 'tb' || rawUnit === 'טרה' ? 'TB' : 'GB';
        return `${num}${unit}`;
      })).slice(0, 4)
    : undefined;

  // Chip model (M1, M2, i7, etc.)
  const chipMatches = [...text.matchAll(CHIP_PATTERN)];
  const chipModel = chipMatches.length > 0
    ? chipMatches[0][0].trim()
    : undefined;

  // Year
  const yearMatches = [...text.matchAll(YEAR_PATTERN)];
  const year = yearMatches.length > 0 ? yearMatches[0][0] : undefined;

  // Missing items
  const missingItems = dedupe(
    MISSING_PATTERNS
      .filter(({ pattern }) => pattern.test(text))
      .map(({ label }) => label),
  );

  // Red flags
  const redFlags = dedupe(
    RED_FLAG_PATTERNS
      .filter(({ pattern }) => pattern.test(text))
      .map(({ label }) => label),
  );

  // Build summary string for AI prompt
  const parts: string[] = [];
  if (chipModel) parts.push(`Chip: ${chipModel}`);
  if (ram) parts.push(ram);
  if (storage?.length) parts.push(`Storage: ${storage.join(' + ')}`);
  if (year) parts.push(`Year: ${year}`);
  if (missingItems.length) parts.push(`Missing: ${missingItems.join(', ')}`);
  if (redFlags.length) parts.push(`⚠️ Red flags: ${redFlags.join(', ')}`);

  return {
    ram,
    storage,
    chipModel,
    year,
    missingItems,
    redFlags,
    summary: parts.length > 0 ? parts.join(' | ') : 'No specs detected',
  };
}

// Returns an enriched search query with key specs appended
export function buildEnrichedQuery(title: string, specs: ProductSpecs): string {
  const tokens: string[] = [title];
  if (specs.chipModel) tokens.push(specs.chipModel);
  if (specs.ram) tokens.push(specs.ram);
  return tokens.join(' ');
}
