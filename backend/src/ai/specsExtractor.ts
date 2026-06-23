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

// Returns an enriched search query with key specs appended
export function buildEnrichedQuery(title: string, specs: ProductSpecs): string {
  const tokens: string[] = [title];
  if (specs.chipModel) tokens.push(specs.chipModel);
  if (specs.ram) tokens.push(specs.ram);
  return tokens.join(' ');
}
