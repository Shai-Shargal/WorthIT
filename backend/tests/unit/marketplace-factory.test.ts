import { describe, expect, it } from 'vitest';

import { FacebookExtractor, MarketplaceExtractorFactory, Yad2Extractor } from '../../src/marketplace/index.js';

describe('MarketplaceExtractorFactory', () => {
  /**
   * Test 1: Factory returns FacebookExtractor for facebook.com URL
   *
   * Verifies that:
   * - getExtractor() recognizes facebook.com URLs
   * - Returns an instance of FacebookExtractor
   * - Instance has both required methods: extractListing and validateUrl
   */
  it('returns FacebookExtractor for facebook.com URL', () => {
    const url = 'https://www.facebook.com/marketplace/item/123456789';
    const extractor = MarketplaceExtractorFactory.getExtractor(url);

    expect(extractor).toBeInstanceOf(FacebookExtractor);
    expect(extractor).toHaveProperty('extractListing');
    expect(extractor).toHaveProperty('validateUrl');
    expect(typeof extractor.extractListing).toBe('function');
    expect(typeof extractor.validateUrl).toBe('function');
  });

  /**
   * Test 2: Factory returns Yad2Extractor for yad2.co.il URL
   *
   * Verifies that:
   * - getExtractor() recognizes yad2.co.il URLs
   * - Returns an instance of Yad2Extractor
   * - Instance has both required methods: extractListing and validateUrl
   */
  it('returns Yad2Extractor for yad2.co.il URL', () => {
    const url = 'https://www.yad2.co.il/item/123456789';
    const extractor = MarketplaceExtractorFactory.getExtractor(url);

    expect(extractor).toBeInstanceOf(Yad2Extractor);
    expect(extractor).toHaveProperty('extractListing');
    expect(extractor).toHaveProperty('validateUrl');
    expect(typeof extractor.extractListing).toBe('function');
    expect(typeof extractor.validateUrl).toBe('function');
  });

  /**
   * Test 3: Factory throws descriptive error on unsupported marketplace URL
   *
   * Verifies that:
   * - getExtractor() throws Error for unrecognized URLs
   * - Error message is descriptive and contains the URL
   * - Works for various unsupported marketplaces (eBay, Amazon, etc.)
   */
  it('throws on unsupported marketplace URL', () => {
    const unsupportedUrls = [
      'https://ebay.com/itm/123456789',
      'https://amazon.com/dp/B123456789',
      'https://www.etsy.com/listing/1234567890',
      'https://mercari.com/item/m12345678900',
    ];

    for (const url of unsupportedUrls) {
      expect(() => {
        MarketplaceExtractorFactory.getExtractor(url);
      }).toThrow();

      // Verify error message contains useful context
      expect(() => {
        MarketplaceExtractorFactory.getExtractor(url);
      }).toThrow(/unsupported|marketplace/i);

      // Verify error message includes the URL for debugging
      expect(() => {
        MarketplaceExtractorFactory.getExtractor(url);
      }).toThrow(url);
    }
  });

  /**
   * Test 4: Both extractors implement IMarketplaceExtractor correctly
   *
   * Verifies that:
   * - FacebookExtractor instances have both required methods
   * - Yad2Extractor instances have both required methods
   * - Methods exist and are callable (functions)
   * - Interface contract is satisfied
   */
  it('both extractors implement IMarketplaceExtractor correctly', () => {
    const facebookExtractor = new FacebookExtractor();
    const yad2Extractor = new Yad2Extractor();

    // Verify FacebookExtractor has required methods
    expect(typeof facebookExtractor.extractListing).toBe('function');
    expect(typeof facebookExtractor.validateUrl).toBe('function');
    expect(facebookExtractor).toHaveProperty('extractListing');
    expect(facebookExtractor).toHaveProperty('validateUrl');

    // Verify Yad2Extractor has required methods
    expect(typeof yad2Extractor.extractListing).toBe('function');
    expect(typeof yad2Extractor.validateUrl).toBe('function');
    expect(yad2Extractor).toHaveProperty('extractListing');
    expect(yad2Extractor).toHaveProperty('validateUrl');
  });

  /**
   * Test 5 (Recommended): Factory correctly routes using static validateUrl
   *
   * Verifies that:
   * - Static validateUrl methods on extractors correctly identify their URLs
   * - Factory routing matches extractor validation
   * - No false positives or negatives in routing
   */
  it('factory correctly routes using static validateUrl on extractors', () => {
    const facebookUrl = 'https://www.facebook.com/marketplace/item/123';
    const yad2Url = 'https://www.yad2.co.il/item/456';
    const unsupportedUrl = 'https://ebay.com/itm/789';

    // Verify static validators work
    expect(FacebookExtractor.validateUrl(facebookUrl)).toBe(true);
    expect(Yad2Extractor.validateUrl(facebookUrl)).toBe(false);

    expect(Yad2Extractor.validateUrl(yad2Url)).toBe(true);
    expect(FacebookExtractor.validateUrl(yad2Url)).toBe(false);

    expect(FacebookExtractor.validateUrl(unsupportedUrl)).toBe(false);
    expect(Yad2Extractor.validateUrl(unsupportedUrl)).toBe(false);

    // Verify factory routing matches validators
    const facebookExtractor = MarketplaceExtractorFactory.getExtractor(facebookUrl);
    expect(facebookExtractor).toBeInstanceOf(FacebookExtractor);
    expect(facebookExtractor.validateUrl(facebookUrl)).toBe(true);

    const yad2Extractor = MarketplaceExtractorFactory.getExtractor(yad2Url);
    expect(yad2Extractor).toBeInstanceOf(Yad2Extractor);
    expect(yad2Extractor.validateUrl(yad2Url)).toBe(true);
  });

  /**
   * Additional test: Verify different Facebook URL formats are recognized
   */
  it('recognizes various Facebook marketplace URL formats', () => {
    const facebookUrls = [
      'https://www.facebook.com/marketplace/item/123',
      'https://facebook.com/marketplace/item/456',
      'https://m.facebook.com/marketplace/item/789',
    ];

    for (const url of facebookUrls) {
      const extractor = MarketplaceExtractorFactory.getExtractor(url);
      expect(extractor).toBeInstanceOf(FacebookExtractor);
    }
  });

  /**
   * Additional test: Verify different Yad2 URL formats are recognized
   */
  it('recognizes various Yad2 URL formats', () => {
    const yad2Urls = [
      'https://www.yad2.co.il/item/123',
      'https://yad2.co.il/item/456',
    ];

    for (const url of yad2Urls) {
      const extractor = MarketplaceExtractorFactory.getExtractor(url);
      expect(extractor).toBeInstanceOf(Yad2Extractor);
    }
  });
});
