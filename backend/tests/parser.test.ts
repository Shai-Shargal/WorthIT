import { describe, expect, it } from 'vitest';
import { parseListing } from '../src/services/parser.js';

describe('parseListing', () => {
  it('extracts title and numeric price from free text', () => {
    const parsed = parseListing('iPhone 13 128GB excellent condition 2,450');
    expect(parsed.price).toBe(2450);
    expect(parsed.name.toLowerCase()).toContain('iphone');
  });

  it('supports currency symbols', () => {
    const parsed = parseListing('MacBook Air M1 $899');
    expect(parsed.price).toBe(899);
    expect(parsed.currency).toBe('USD');
  });

  it('throws 400 when no price appears', () => {
    expect(() => parseListing('Just text without a number')).toThrowError(
      'Could not detect a price in the input.',
    );
  });
});

