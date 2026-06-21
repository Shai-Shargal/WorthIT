import { describe, it, expect } from 'vitest';
import {
  guessCategory,
  detectPriceSanity,
  detectStockPhoto,
  detectUrgencyLanguage,
  detectMissingAccessories,
  getAllRedFlags,
} from '../src/services/fraudDetection.js';

describe('guessCategory', () => {
  it('detects phone from iphone', () => expect(guessCategory('iPhone 13 Pro')).toBe('phone'));
  it('detects phone from samsung', () => expect(guessCategory('Samsung Galaxy S22')).toBe('phone'));
  it('detects laptop from macbook', () => expect(guessCategory('MacBook Pro M2')).toBe('laptop'));
  it('detects laptop from dell', () => expect(guessCategory('Dell XPS 15')).toBe('laptop'));
  it('detects gaming from ps5', () => expect(guessCategory('PS5 console')).toBe('gaming'));
  it('returns null for unrecognised item', () => expect(guessCategory('Mystery item')).toBeNull());

  it('does NOT match carpet as car', () => expect(guessCategory('carpet cleaning machine')).not.toBe('car'));
  it('does NOT match cartoon as car', () => expect(guessCategory('cartoon dvd collection')).not.toBe('car'));
  it('does NOT match scar as car', () => expect(guessCategory('scar tissue book')).not.toBe('car'));
});

describe('detectPriceSanity', () => {
  it('flags suspiciously low price for a phone', () => {
    const flag = detectPriceSanity({ title: 'iPhone 13', price: 50, currency: 'ILS' });
    expect(flag).not.toBeNull();
    expect(flag?.category).toBe('price');
    expect(flag?.severity).toBe('warning');
  });

  it('flags suspiciously high price for a phone', () => {
    const flag = detectPriceSanity({ title: 'iPhone 13', price: 100000, currency: 'ILS' });
    expect(flag).not.toBeNull();
    expect(flag?.category).toBe('price');
  });

  it('returns null for normal price', () => {
    const flag = detectPriceSanity({ title: 'iPhone 13', price: 2000, currency: 'ILS' });
    expect(flag).toBeNull();
  });

  it('returns null for unrecognised category', () => {
    const flag = detectPriceSanity({ title: 'Mystery item', price: 1, currency: 'ILS' });
    expect(flag).toBeNull();
  });

  it('does NOT flag carpet as cheap car', () => {
    const flag = detectPriceSanity({ title: 'carpet 2x3 meters', price: 300, currency: 'ILS' });
    expect(flag).toBeNull();
  });
});

describe('detectStockPhoto', () => {
  it('flags unsplash image URL', () => {
    const flag = detectStockPhoto({ title: 'item', price: 100, currency: 'ILS', image: 'https://images.unsplash.com/photo-abc' });
    expect(flag?.severity).toBe('high_risk');
  });

  it('flags shutterstock URL', () => {
    const flag = detectStockPhoto({ title: 'item', price: 100, currency: 'ILS', image: 'https://shutterstock.com/img/123' });
    expect(flag).not.toBeNull();
  });

  it('returns null for normal image URL', () => {
    const flag = detectStockPhoto({ title: 'item', price: 100, currency: 'ILS', image: 'https://facebook.com/photo/123' });
    expect(flag).toBeNull();
  });

  it('returns null when no image', () => {
    const flag = detectStockPhoto({ title: 'item', price: 100, currency: 'ILS' });
    expect(flag).toBeNull();
  });
});

describe('detectUrgencyLanguage', () => {
  it('flags 2+ urgency keywords', () => {
    const flag = detectUrgencyLanguage('urgent sale must sell today asap');
    expect(flag).not.toBeNull();
    expect(flag?.category).toBe('description');
  });

  it('returns null for single urgency keyword', () => {
    const flag = detectUrgencyLanguage('urgent - contact me');
    expect(flag).toBeNull();
  });

  it('returns null for undefined description', () => {
    expect(detectUrgencyLanguage(undefined)).toBeNull();
  });

  it('returns null for clean listing', () => {
    const flag = detectUrgencyLanguage('Good condition, works perfectly.');
    expect(flag).toBeNull();
  });
});

describe('detectMissingAccessories', () => {
  it('flags phone missing charger and box', () => {
    const flag = detectMissingAccessories('iPhone 13', 'selling phone in good condition');
    expect(flag).not.toBeNull();
    expect(flag?.category).toBe('condition');
  });

  it('returns null when accessories mentioned', () => {
    const flag = detectMissingAccessories('iPhone 13', 'comes with charger, cable and original box');
    expect(flag).toBeNull();
  });

  it('detects MacBook as laptop via guessCategory', () => {
    const flag = detectMissingAccessories('MacBook Pro', 'selling, great condition');
    expect(flag).not.toBeNull();
  });

  it('returns null for unrecognised category', () => {
    const flag = detectMissingAccessories('Vintage lamp', 'nice lamp');
    expect(flag).toBeNull();
  });
});

describe('getAllRedFlags', () => {
  it('returns empty array for clean listing', () => {
    const flags = getAllRedFlags({ title: 'iPhone 13', price: 2000, currency: 'ILS' });
    expect(flags).toBeInstanceOf(Array);
  });

  it('returns multiple flags when several issues present', () => {
    const flags = getAllRedFlags({
      title: 'iPhone 13',
      price: 50,
      currency: 'ILS',
      image: 'https://unsplash.com/photo-abc',
      description: 'urgent must sell asap final offer',
    });
    expect(flags.length).toBeGreaterThanOrEqual(2);
  });
});
