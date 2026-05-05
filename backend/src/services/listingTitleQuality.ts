/** Heuristic filters for scraped Marketplace rows that are UI noise, not a product name. */

const UI_PATTERNS: RegExp[] = [
  /פורסמו.*עכשיו/i,
  /\bposted\s+just\s+now\b/i,
  /\bjust\s+now\b/i,
  /\b\d+\s*(min|mins|minute|minutes|hour|hours|hrs?|day|days)\s+ago\b/i,
  /\bago\b\s*$/i,
  /\bsponsored\b/i,
  /\bמשווק\b/, // marketed / sponsored-ish
];

export function looksLikeUiNoiseTitle(title: string): boolean {
  const t = title.normalize('NFKC').trim();
  if (t.length < 6) return true;

  const lower = t.toLowerCase();

  // Must contain at least a few Unicode letters — filters pure junk / emoji-only rows.
  const letters = t.match(/\p{L}/gu);
  if (!letters || letters.length < 4) return true;

  // Reject titles that look like "only posted X ago" timelines.
  for (const re of UI_PATTERNS) {
    if (re.test(lower)) return true;
    if (re.test(t)) return true;
  }

  return false;
}
