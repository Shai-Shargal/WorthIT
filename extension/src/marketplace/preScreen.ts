import type { ObservedListing } from './types.js';

const RED_FLAG_PATTERNS: RegExp[] = [
  /as.?is/i,
  /כפי שהוא/,
  /untested/i,
  /לא בדוק/,
  /חייב למכור/,
  /urgent/i,
  /ללא מטען/,
  /no charger/i,
  /שלט אחד/,
  /one controller/i,
  /כנסו לתיאור/,
];

export function hasRedFlag(title: string): boolean {
  return RED_FLAG_PATTERNS.some((p) => p.test(title));
}

export function preScreen(listings: ObservedListing[], topN = 5): ObservedListing[] {
  if (listings.length === 0) return [];
  const clean = listings.filter((l) => !hasRedFlag(l.title));
  const flagged = listings.filter((l) => hasRedFlag(l.title));
  const sorted = [
    ...clean.sort((a, b) => a.price - b.price),
    ...flagged.sort((a, b) => a.price - b.price),
  ];
  return sorted.slice(0, topN);
}
