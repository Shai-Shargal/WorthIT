/** Drop Facebook Marketplace row titles that look like timelines / UI chrome, not a product. */

const UI_PATTERNS: RegExp[] = [
  /פורסמו.*עכשיו/i,
  /\bposted\s+just\s+now\b/i,
  /\bjust\s+now\b/i,
  /\b\d+\s*(min|mins|minute|minutes|hour|hours|hrs?|day|days)\s+ago\b/i,
  /\bago\b\s*$/i,
  /\bsponsored\b/i,
  // Facebook "New for you" recommendation chrome — appears in og:title when
  // the SPA hasn't flushed the real product title yet.
  /^חדש בשבילך$/i,
  /^new for you$/i,
  /^marketplace$/i,
  /^facebook marketplace$/i,
];

export function isLikelyFbUiTitle(title: string): boolean {
  const t = title.normalize('NFKC').trim();
  if (t.length < 6) return true;

  const letters = t.match(/\p{L}/gu);
  if (!letters || letters.length < 4) return true;

  const lower = t.toLowerCase();
  return UI_PATTERNS.some((re) => re.test(lower) || re.test(t));
}
