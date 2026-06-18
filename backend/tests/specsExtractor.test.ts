import { describe, it, expect } from 'vitest';
import { extractSpecs, buildEnrichedQuery } from '../src/ai/specsExtractor.js';

describe('extractSpecs — storage', () => {
  it('extracts GB correctly', () => {
    const s = extractSpecs('MacBook Pro 256GB SSD');
    expect(s.storage).toContain('256GB');
  });

  it('extracts TB correctly', () => {
    const s = extractSpecs('MacBook Pro 2TB SSD');
    expect(s.storage).toContain('2TB');
  });

  it('does not label 512GB as 512TB', () => {
    const s = extractSpecs('Laptop 512GB SSD');
    expect(s.storage).toContain('512GB');
    expect(s.storage).not.toContain('512TB');
  });

  it('extracts Hebrew storage unit גיגה as GB', () => {
    const s = extractSpecs('מחשב 256 גיגה SSD');
    expect(s.storage).toContain('256GB');
  });

  it('extracts Hebrew storage unit טרה as TB', () => {
    const s = extractSpecs('מחשב 1 טרה SSD');
    expect(s.storage).toContain('1TB');
  });

  it('deduplicates repeated storage values', () => {
    const s = extractSpecs('256GB SSD storage 256GB');
    expect(s.storage?.length).toBe(1);
  });
});

describe('extractSpecs — RAM', () => {
  it('extracts RAM in GB', () => {
    const s = extractSpecs('MacBook 16GB RAM');
    expect(s.ram).toBe('16GB RAM');
  });

  it('extracts Hebrew RAM', () => {
    const s = extractSpecs('מחשב 16 גיגה ראם');
    expect(s.ram).toBe('16GB RAM');
  });

  it('does not confuse RAM with storage', () => {
    const s = extractSpecs('16GB RAM 512GB SSD');
    expect(s.ram).toBe('16GB RAM');
    expect(s.storage).toContain('512GB');
    expect(s.storage).not.toContain('16GB');
  });
});

describe('extractSpecs — chip', () => {
  it('extracts M1', () => expect(extractSpecs('MacBook M1').chipModel).toMatch(/m1/i));
  it('extracts M2 Pro', () => expect(extractSpecs('MacBook M2 Pro').chipModel).toMatch(/m2\s*pro/i));
  it('extracts Intel i7', () => expect(extractSpecs('Laptop i7-1165G7').chipModel).toMatch(/i7/i));
});

describe('extractSpecs — year', () => {
  it('extracts year from title', () => {
    expect(extractSpecs('iPhone 2022').year).toBe('2022');
  });

  it('returns undefined when no year present', () => {
    expect(extractSpecs('iPhone 13 Pro').year).toBeUndefined();
  });
});

describe('extractSpecs — red flags', () => {
  it('does NOT flag listing WITH warranty as no-warranty', () => {
    const s = extractSpecs('מגיע עם אחריות יצרן');
    expect(s.redFlags).not.toContain('No warranty');
  });

  it('flags listing WITHOUT warranty', () => {
    const s = extractSpecs('ללא אחריות');
    expect(s.redFlags).toContain('No warranty');
  });

  it('flags "לא כולל אחריות"', () => {
    const s = extractSpecs('מוצר תקין לא כולל אחריות');
    expect(s.redFlags).toContain('No warranty');
  });

  it('flags no warranty in English', () => {
    const s = extractSpecs('sold no warranty');
    expect(s.redFlags).toContain('No warranty');
  });

  it('flags untested', () => {
    const s = extractSpecs('לא נבדק');
    expect(s.redFlags).toContain('Untested / not verified');
  });

  it('flags physical damage', () => {
    const s = extractSpecs('יש סדק קטן במסך');
    expect(s.redFlags).toContain('Physical damage mentioned');
  });

  it('flags urgent sale — Hebrew למכירה', () => {
    const s = extractSpecs('חייב למכירה דחוף');
    expect(s.redFlags).toContain('Urgent sale language');
  });

  it('flags urgency pressure — דחופה', () => {
    const s = extractSpecs('מכירה דחופה');
    expect(s.redFlags).toContain('Urgency pressure');
  });

  it('returns empty redFlags for clean listing', () => {
    const s = extractSpecs('iPhone 13 Pro מצב מעולה עם אחריות');
    expect(s.redFlags).toHaveLength(0);
  });
});

describe('extractSpecs — missing items', () => {
  it('flags no charger in Hebrew', () => {
    const s = extractSpecs('ללא מטען');
    expect(s.missingItems).toContain('No charger/box');
  });

  it('flags no charger in English', () => {
    const s = extractSpecs('sold without charger');
    expect(s.missingItems).toContain('No charger/box');
  });

  it('flags as-is in English', () => {
    const s = extractSpecs('sold as-is');
    expect(s.missingItems).toContain('Sold as-is');
  });

  it('flags missing accessories with Hebrew חסר', () => {
    const s = extractSpecs('חסר מטען');
    expect(s.missingItems).toContain('Missing accessories');
  });

  it('flags missing accessories with English missing', () => {
    const s = extractSpecs('missing cable');
    expect(s.missingItems).toContain('Missing accessories');
  });
});

describe('buildEnrichedQuery', () => {
  it('appends chip and RAM to title', () => {
    const specs = extractSpecs('MacBook Pro M2 16GB RAM');
    const q = buildEnrichedQuery('MacBook Pro', specs);
    expect(q).toContain('MacBook Pro');
    expect(q).toContain('M2');
    expect(q).toContain('16GB RAM');
  });

  it('returns just title when no specs detected', () => {
    const specs = extractSpecs('used item');
    const q = buildEnrichedQuery('used item', specs);
    expect(q.trim()).toBe('used item');
  });
});
