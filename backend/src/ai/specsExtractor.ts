import {
  RAM_PATTERN,
  STORAGE_PATTERN,
  CHIP_PATTERN,
  YEAR_PATTERN,
  MISSING_PATTERNS,
  RED_FLAG_PATTERNS,
} from './specs/patterns.js';

export interface ProductSpecs {
  ram?: string;
  storage?: string[];
  chipModel?: string;
  year?: string;
  missingItems: string[];
  redFlags: string[];
  summary: string;
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

function extractRam(text: string): string | undefined {
  const matches = [...text.matchAll(RAM_PATTERN)];
  return matches.length > 0 ? `${matches[0][1]}GB RAM` : undefined;
}

function extractStorage(text: string): string[] | undefined {
  const matches = [...text.matchAll(STORAGE_PATTERN)];
  if (matches.length === 0) return undefined;
  return dedupe(matches.map((m) => {
    const num = parseInt(m[1], 10);
    const rawUnit = m[2].toLowerCase();
    const unit = rawUnit === 'tb' || rawUnit === 'טרה' ? 'TB' : 'GB';
    return `${num}${unit}`;
  })).slice(0, 4);
}

function extractChip(text: string): string | undefined {
  const matches = [...text.matchAll(CHIP_PATTERN)];
  return matches.length > 0 ? matches[0][0].trim() : undefined;
}

function extractYear(text: string): string | undefined {
  const matches = [...text.matchAll(YEAR_PATTERN)];
  return matches.length > 0 ? matches[0][0] : undefined;
}

function matchPatterns(text: string, patterns: Array<{ pattern: RegExp; label: string }>): string[] {
  return dedupe(
    patterns
      .filter(({ pattern }) => pattern.test(text))
      .map(({ label }) => label),
  );
}

function buildSummary(specs: Omit<ProductSpecs, 'summary'>): string {
  const parts: string[] = [];
  if (specs.chipModel) parts.push(`Chip: ${specs.chipModel}`);
  if (specs.ram) parts.push(specs.ram);
  if (specs.storage?.length) parts.push(`Storage: ${specs.storage.join(' + ')}`);
  if (specs.year) parts.push(`Year: ${specs.year}`);
  if (specs.missingItems.length) parts.push(`Missing: ${specs.missingItems.join(', ')}`);
  if (specs.redFlags.length) parts.push(`⚠️ Red flags: ${specs.redFlags.join(', ')}`);
  return parts.length > 0 ? parts.join(' | ') : 'No specs detected';
}

export function extractSpecs(title: string, description?: string): ProductSpecs {
  const text = `${title} ${description ?? ''}`;

  const partial = {
    ram: extractRam(text),
    storage: extractStorage(text),
    chipModel: extractChip(text),
    year: extractYear(text),
    missingItems: matchPatterns(text, MISSING_PATTERNS),
    redFlags: matchPatterns(text, RED_FLAG_PATTERNS),
  };

  return { ...partial, summary: buildSummary(partial) };
}

// Extracts the first capitalised brand/model token from a description.
// Looks for a sequence of Latin words starting with an uppercase letter —
// e.g. "Jackson Rhoads JA32", "Seymour Duncan", "Floyd Rose", "Fender Stratocaster".
// Only the FIRST such sequence is returned so we don't flood the search query.
function extractBrandModelFromDescription(description: string | undefined): string {
  if (!description) return '';
  // Match sequences of 1-3 capitalised Latin words (the model/brand name at
  // the start of a listing description before the rest of the Hebrew text).
  const match = description.match(/\b([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,2})\b/);
  const candidate = match?.[1]?.trim() ?? '';
  // Skip single very short tokens that are likely abbreviations, not brands.
  if (candidate.length < 4) return '';
  return candidate;
}

// Returns an enriched search query with key specs and brand/model appended.
export function buildEnrichedQuery(
  title: string,
  specs: ProductSpecs,
  description?: string,
): string {
  const tokens: string[] = [title];
  if (specs.chipModel) tokens.push(specs.chipModel);
  if (specs.ram) tokens.push(specs.ram);
  // For non-tech products the description often contains the brand/model name
  // (e.g. "Jackson Rhoads JA32", "Floyd Rose") that makes the Tavily search
  // much more specific than searching by the generic Hebrew title alone.
  if (!specs.chipModel && !specs.ram) {
    const brand = extractBrandModelFromDescription(description);
    if (brand) tokens.push(brand);
  }
  return tokens.join(' ');
}
