import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

vi.mock('../../src/services/googleAuth.js', () => ({
  verifyJWT: vi.fn(),
}));

vi.mock('../../src/services/quotaService.js', () => ({
  checkQuotaAndIncrement: vi.fn(),
}));

vi.mock('../../src/services/productService.js', () => ({
  findOrCreateProduct: vi.fn(),
  updateProductAnalysisHistory: vi.fn(),
}));

import { verifyJWT } from '../../src/services/googleAuth.js';
import { checkQuotaAndIncrement } from '../../src/services/quotaService.js';
import { findOrCreateProduct, updateProductAnalysisHistory } from '../../src/services/productService.js';

const verifyMock = vi.mocked(verifyJWT);
const quotaMock = vi.mocked(checkQuotaAndIncrement);
const productMock = vi.mocked(findOrCreateProduct);
const historyMock = vi.mocked(updateProductAnalysisHistory);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Analyze Endpoint Integration', () => {
  it('POST /analyze with valid data returns 200 with verdict', async () => {
    verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
    quotaMock.mockResolvedValue({ allowed: true, analysesRemaining: 14 });
    productMock.mockResolvedValue('product-123');
    historyMock.mockResolvedValue(undefined);

    const app = createApp();
    const res = await request(app)
      .post('/analysis/analyze')
      .set('Authorization', 'Bearer valid-token')
      .send({
        title: 'iPhone 13',
        price: 1500,
        currency: 'ILS',
        description: 'Good condition, all accessories',
        url: 'https://facebook.com/marketplace/item/123',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('analysisId');
    expect(res.body).toHaveProperty('verdict');
    expect(res.body).toHaveProperty('reasoning');
    expect(res.body).toHaveProperty('redFlags');
    expect(res.body).toHaveProperty('analysesRemaining', 14);
  });

  it('POST /analyze returns 400 for missing required fields', async () => {
    verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });

    const app = createApp();

    // Missing price
    let res = await request(app)
      .post('/analysis/analyze')
      .set('Authorization', 'Bearer valid-token')
      .send({ title: 'iPhone 13', currency: 'ILS' });
    expect(res.status).toBe(400);

    // Missing title
    res = await request(app)
      .post('/analysis/analyze')
      .set('Authorization', 'Bearer valid-token')
      .send({ price: 1500, currency: 'ILS' });
    expect(res.status).toBe(400);

    // Missing currency
    res = await request(app)
      .post('/analysis/analyze')
      .set('Authorization', 'Bearer valid-token')
      .send({ title: 'iPhone 13', price: 1500 });
    expect(res.status).toBe(400);
  });

  it('POST /analyze returns 402 when quota exceeded', async () => {
    verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
    quotaMock.mockResolvedValue({
      allowed: false,
      analysesRemaining: 0,
      reason: 'Quota exceeded. Limit: 15 analyses per month.',
    });

    const app = createApp();
    const res = await request(app)
      .post('/analysis/analyze')
      .set('Authorization', 'Bearer valid-token')
      .send({
        title: 'iPhone 13',
        price: 1500,
        currency: 'ILS',
      });

    expect(res.status).toBe(402);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('analysesRemaining', 0);
  });

  it('POST /analyze includes fraud detection red flags', async () => {
    verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
    quotaMock.mockResolvedValue({ allowed: true, analysesRemaining: 14 });
    productMock.mockResolvedValue('product-123');
    historyMock.mockResolvedValue(undefined);

    const app = createApp();
    const res = await request(app)
      .post('/analysis/analyze')
      .set('Authorization', 'Bearer valid-token')
      .send({
        title: 'iPhone 13',
        price: 500, // Suspiciously low
        currency: 'ILS',
        description: 'URGENT SALE! MUST SELL TODAY!',
        image: 'https://unsplash.com/stock-photo.jpg', // Stock photo
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('redFlags');
    expect(Array.isArray(res.body.redFlags)).toBe(true);
    // Should detect low price, stock photo, and urgency language
    expect(res.body.redFlags.length).toBeGreaterThan(0);
  });

  it('POST /analyze links analysis to userId and productId', async () => {
    verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
    quotaMock.mockResolvedValue({ allowed: true, analysesRemaining: 14 });
    productMock.mockResolvedValue('product-456');
    historyMock.mockResolvedValue(undefined);

    const app = createApp();
    await request(app)
      .post('/analysis/analyze')
      .set('Authorization', 'Bearer valid-token')
      .send({
        title: 'MacBook Pro',
        price: 5000,
        currency: 'ILS',
      });

    // Verify product was created/found
    expect(productMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'MacBook Pro', price: 5000 }),
      'facebook',
    );

    // Verify product history was updated
    expect(historyMock).toHaveBeenCalledWith(
      'product-456',
      expect.objectContaining({
        analysisId: expect.any(String),
        userId: 'user-123',
        verdict: expect.stringMatching(/worth_it|maybe|avoid/),
      }),
    );
  });

  it('POST /analyze returns consistent analysisId format', async () => {
    verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
    quotaMock.mockResolvedValue({ allowed: true, analysesRemaining: 14 });
    productMock.mockResolvedValue('product-123');
    historyMock.mockResolvedValue(undefined);

    const app = createApp();
    const res = await request(app)
      .post('/analysis/analyze')
      .set('Authorization', 'Bearer valid-token')
      .send({ title: 'Product 1', price: 100, currency: 'ILS' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('analysisId');
    expect(typeof res.body.analysisId).toBe('string');
    expect(res.body.analysisId.length).toBeGreaterThan(0);
  });
});
