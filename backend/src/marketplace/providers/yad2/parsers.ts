export function parseDate(dateStr: string | undefined | null): Date | undefined {
  if (!dateStr) return undefined;
  const trimmed = dateStr.trim();
  if (!trimmed) return undefined;

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  const m = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) {
    const day = Number.parseInt(m[1], 10);
    const month = Number.parseInt(m[2], 10) - 1;
    let year = Number.parseInt(m[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function pickTitle(titles: string[]): string | undefined {
  for (const t of titles) {
    const cleaned = t.trim();
    if (!cleaned) continue;
    if (/^yad2(\.co\.il)?$/i.test(cleaned)) continue;
    return cleaned;
  }
  return undefined;
}

export function pickDescription(snippets: string[]): string | undefined {
  let best: string | undefined;
  for (const s of snippets) {
    const t = s.trim();
    if (!t) continue;
    if (!best || t.length > best.length) best = t;
  }
  return best;
}

export function findDate(snippets: string[]): Date | undefined {
  for (const s of snippets) {
    const isoMatch = s.match(/\b(\d{4}-\d{2}-\d{2}(?:T[\d:.+\-Z]+)?)\b/);
    if (isoMatch) {
      const d = parseDate(isoMatch[1]);
      if (d) return d;
    }
    const dmyMatch = s.match(/\b(\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/);
    if (dmyMatch) {
      const d = parseDate(dmyMatch[1]);
      if (d) return d;
    }
  }
  return undefined;
}

export function extractSellerName(fields: Array<string | undefined>): string | undefined {
  const candidates = fields.filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
  for (const c of candidates) {
    const byMatch = c.match(/(?:by|seller|מוכר|מאת)\s*[:\-]?\s*([A-Za-z֐-׿][\w֐-׿\s.'-]{1,40})/i);
    if (byMatch) {
      const cleaned = byMatch[1].trim().split(/[.;,!?\n]/)[0].trim();
      if (cleaned) return cleaned;
    }
  }
  return undefined;
}
