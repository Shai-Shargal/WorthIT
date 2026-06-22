import { describe, it, expect } from 'vitest';
import {
  detectPriceSanity,
  detectStockPhoto,
  detectUrgencyLanguage,
  detectMissingAccessories,
  getAllRedFlags,
} from '../../src/services/fraudDetection.js';

describe('Fraud Detection Integration', () => {
  describe('Price Sanity Detection', () => {
    it('flags unusually low prices', () => {
      const listing = {
        title: 'iPhone 13 Pro Max',
        price: 100, // Way too low
        currency: 'ILS',
      };

      const flag = detectPriceSanity(listing);
      expect(flag).not.toBeNull();
      expect(flag?.category).toBe('price');
      expect(flag?.severity).toBe('warning');
      expect(flag?.description).toContain('unusually low');
    });

    it('flags unusually high prices', () => {
      const listing = {
        title: 'iPhone 13',
        price: 50000, // Way too high
        currency: 'ILS',
      };

      const flag = detectPriceSanity(listing);
      expect(flag).not.toBeNull();
      expect(flag?.category).toBe('price');
      expect(flag?.severity).toBe('warning');
      expect(flag?.description).toContain('unusually high');
    });

    it('does not flag reasonable prices', () => {
      const listing = {
        title: 'iPhone 13',
        price: 3500, // Reasonable
        currency: 'ILS',
      };

      const flag = detectPriceSanity(listing);
      expect(flag).toBeNull();
    });

    it('returns null for unknown product category', () => {
      const listing = {
        title: 'Unknown Widget XYZ',
        price: 99999,
        currency: 'ILS',
      };

      const flag = detectPriceSanity(listing);
      expect(flag).toBeNull();
    });
  });

  describe('Stock Photo Detection', () => {
    it('detects unsplash images', () => {
      const listing = {
        title: 'iPhone 13',
        price: 3500,
        currency: 'ILS',
        image: 'https://images.unsplash.com/photo-123456789',
      };

      const flag = detectStockPhoto(listing);
      expect(flag).not.toBeNull();
      expect(flag?.category).toBe('photo');
      expect(flag?.severity).toBe('high_risk');
      expect(flag?.description).toContain('stock photo');
    });

    it('detects pexels images', () => {
      const listing = {
        title: 'Laptop',
        price: 5000,
        currency: 'ILS',
        image: 'https://www.pexels.com/photo/12345',
      };

      const flag = detectStockPhoto(listing);
      expect(flag).not.toBeNull();
      expect(flag?.description).toContain('pexels');
    });

    it('does not flag real product images', () => {
      const listing = {
        title: 'iPhone 13',
        price: 3500,
        currency: 'ILS',
        image: 'https://fbcdn.net/v/real-photo-12345.jpg',
      };

      const flag = detectStockPhoto(listing);
      expect(flag).toBeNull();
    });

    it('returns null if no image provided', () => {
      const listing = {
        title: 'iPhone 13',
        price: 3500,
        currency: 'ILS',
      };

      const flag = detectStockPhoto(listing);
      expect(flag).toBeNull();
    });
  });

  describe('Urgency Language Detection', () => {
    it('detects multiple urgency keywords', () => {
      const listing = {
        title: 'iPhone 13',
        price: 3500,
        currency: 'ILS',
        description: 'URGENT! Must sell today ASAP! Limited time offer!',
      };

      const flag = detectUrgencyLanguage(listing.description);
      expect(flag).not.toBeNull();
      expect(flag?.category).toBe('description');
      expect(flag?.severity).toBe('caution');
      expect(flag?.description.toLowerCase()).toContain('high-pressure');
    });

    it('does not flag single urgency keyword', () => {
      const listing = {
        title: 'iPhone 13',
        price: 3500,
        currency: 'ILS',
        description: 'Selling soon',
      };

      const flag = detectUrgencyLanguage(listing.description);
      expect(flag).toBeNull();
    });

    it('returns null if no description', () => {
      const flag = detectUrgencyLanguage(undefined);
      expect(flag).toBeNull();
    });
  });

  describe('Missing Accessories Detection', () => {
    it('flags phone missing charger/cable/box', () => {
      const listing = {
        title: 'iPhone 13 phone',
        price: 3500,
        currency: 'ILS',
        description: 'Good condition but charger not included',
      };

      const flag = detectMissingAccessories(listing.title, listing.description);
      expect(flag).not.toBeNull();
      expect(flag?.category).toBe('condition');
      expect(flag?.severity).toBe('caution');
      expect(flag?.description).toContain('missing common accessories');
    });

    it('does not flag if accessories mentioned', () => {
      const listing = {
        title: 'iPhone 13',
        price: 3500,
        currency: 'ILS',
        description: 'Includes original charger, cable, and box',
      };

      const flag = detectMissingAccessories(listing.title, listing.description);
      expect(flag).toBeNull();
    });

    it('flags laptop missing charger/cable', () => {
      const listing = {
        title: 'MacBook Pro 14"',
        price: 8000,
        currency: 'ILS',
        description: 'Works great but charger not included',
      };

      const flag = detectMissingAccessories(listing.title, listing.description);
      expect(flag).not.toBeNull();
      expect(flag?.description).toContain('missing common accessories');
    });

    it('returns null for unknown product', () => {
      const listing = {
        title: 'Random Item XYZ',
        price: 100,
        currency: 'ILS',
      };

      const flag = detectMissingAccessories(listing.title, listing.description);
      expect(flag).toBeNull();
    });
  });

  describe('getAllRedFlags Integration', () => {
    it('combines all fraud indicators', () => {
      const listing = {
        title: 'iPhone 13',
        price: 100, // Way too low (< 30% of min ₪500)
        currency: 'ILS',
        description: 'URGENT! Must sell ASAP!', // Urgency
        image: 'https://unsplash.com/stock.jpg', // Stock photo
      };

      const flags = getAllRedFlags(listing);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.map((f) => f.category)).toContain('price');
      expect(flags.map((f) => f.category)).toContain('photo');
      expect(flags.map((f) => f.category)).toContain('description');
    });

    it('returns empty array if no fraud indicators', () => {
      const listing = {
        title: 'Sofa',
        price: 5000, // Reasonable for furniture
        currency: 'ILS',
        description: 'Very good condition, clean and comfortable',
        image: 'https://fbcdn.net/real-photo.jpg', // Real photo
      };

      const flags = getAllRedFlags(listing);
      expect(flags).toEqual([]);
    });

    it('returns array with stock photo flag when image is stock', () => {
      const listing = {
        title: 'iPhone 13',
        price: 3500,
        currency: 'ILS',
        description: 'Good condition with all accessories',
        image: 'https://unsplash.com/stock.jpg',
      };

      const flags = getAllRedFlags(listing);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.some((f) => f.category === 'photo')).toBe(true);
    });
  });
});
