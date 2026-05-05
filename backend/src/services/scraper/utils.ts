export function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.replace(/[^\d.,]/g, '').trim();
  if (!normalized) return null;

  // Prefer comma as thousands separator; drop commas and parse.
  const numeric = Number(normalized.replace(/,/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

export function toAbsoluteUrl(value: string | null | undefined, origin: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, origin).toString();
  } catch {
    return undefined;
  }
}

export function makeListingId(source: 'facebook' | 'yad2', seed: string, index: number): string {
  const cleanSeed = seed.replace(/[^\w]/g, '').slice(0, 20) || 'listing';
  return `${source}-${cleanSeed}-${index}`;
}

