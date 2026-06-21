import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { UsageLogModel } from '../src/models/UsageLog.js';
import { UserFeedbackModel } from '../src/models/UserFeedback.js';
import { ProductModel } from '../src/models/Product.js';
import { AnalysisModel } from '../src/database/models/Analysis.js';

describe('UsageLog schema validation', () => {
  it('rejects invalid yearMonth format', () => {
    const doc = new UsageLogModel({
      userId: new mongoose.Types.ObjectId(),
      yearMonth: '2026/06',
      analysesUsed: 0,
    });
    const err = doc.validateSync();
    expect(err?.errors['yearMonth']).toBeDefined();
  });

  it('accepts valid yearMonth', () => {
    const doc = new UsageLogModel({
      userId: new mongoose.Types.ObjectId(),
      yearMonth: '2026-06',
      analysesUsed: 5,
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects negative analysesUsed', () => {
    const doc = new UsageLogModel({
      userId: new mongoose.Types.ObjectId(),
      yearMonth: '2026-06',
      analysesUsed: -1,
    });
    const err = doc.validateSync();
    expect(err?.errors['analysesUsed']).toBeDefined();
  });
});

describe('UserFeedback schema validation', () => {
  it('rejects accuracy below 1', () => {
    const doc = new UserFeedbackModel({
      userId: new mongoose.Types.ObjectId(),
      analysisId: new mongoose.Types.ObjectId(),
      helpful: true,
      accuracy: 0,
    });
    const err = doc.validateSync();
    expect(err?.errors['accuracy']).toBeDefined();
  });

  it('rejects accuracy above 5', () => {
    const doc = new UserFeedbackModel({
      userId: new mongoose.Types.ObjectId(),
      analysisId: new mongoose.Types.ObjectId(),
      helpful: true,
      accuracy: 6,
    });
    const err = doc.validateSync();
    expect(err?.errors['accuracy']).toBeDefined();
  });

  it('accepts valid feedback without accuracy', () => {
    const doc = new UserFeedbackModel({
      userId: new mongoose.Types.ObjectId(),
      analysisId: new mongoose.Types.ObjectId(),
      helpful: false,
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects notes over 1000 chars', () => {
    const doc = new UserFeedbackModel({
      userId: new mongoose.Types.ObjectId(),
      analysisId: new mongoose.Types.ObjectId(),
      helpful: true,
      notes: 'x'.repeat(1001),
    });
    const err = doc.validateSync();
    expect(err?.errors['notes']).toBeDefined();
  });
});

describe('Product schema validation', () => {
  it('rejects invalid marketplace enum', () => {
    const doc = new ProductModel({
      canonicalUrl: 'https://example.com/item/1',
      marketplace: 'instagram',
      title: 'Test Product',
    });
    const err = doc.validateSync();
    expect(err?.errors['marketplace']).toBeDefined();
  });

  it('accepts valid marketplace values', () => {
    for (const mp of ['facebook', 'yad2', 'ebay', 'amazon']) {
      const doc = new ProductModel({
        canonicalUrl: `https://example.com/${mp}`,
        marketplace: mp,
        title: 'Test',
      });
      expect(doc.validateSync()).toBeUndefined();
    }
  });

  it('initializes analysisHistory as empty array', () => {
    const doc = new ProductModel({
      canonicalUrl: 'https://example.com/item/1',
      marketplace: 'facebook',
      title: 'Test',
    });
    expect((doc as Record<string, unknown>).analysisHistory).toEqual([]);
  });

  it('has no marketObservations field', () => {
    const doc = new ProductModel({
      canonicalUrl: 'https://example.com/item/1',
      marketplace: 'facebook',
      title: 'Test',
    });
    expect((doc as Record<string, unknown>).marketObservations).toBeUndefined();
  });
});

describe('Analysis schema validation', () => {
  it('saves without userId or productId (optional for MVP)', () => {
    const doc = new AnalysisModel({
      analysisId: 'test-uuid-1234',
      listing: { title: 'iPhone 13', price: 1500, currency: 'ILS' },
      verdict: 'maybe',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects invalid verdict enum', () => {
    const doc = new AnalysisModel({
      analysisId: 'test-uuid-1234',
      listing: { title: 'iPhone 13', price: 1500, currency: 'ILS' },
      verdict: 'unknown',
    });
    const err = doc.validateSync();
    expect(err?.errors['verdict']).toBeDefined();
  });

  it('accepts all dataQuality values including seed', () => {
    for (const dq of ['real', 'seed', 'limited', 'insufficient']) {
      const doc = new AnalysisModel({
        analysisId: `test-${dq}`,
        listing: { title: 'Test', price: 100, currency: 'ILS' },
        verdict: 'maybe',
        marketData: { localMarketContext: { dataQuality: dq } },
      });
      expect(doc.validateSync()).toBeUndefined();
    }
  });
});
