import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/database/mongoose.js', () => ({
  isMongoReady: vi.fn().mockReturnValue(true),
}));

vi.mock('../src/models/Product.js', () => ({
  ProductModel: {
    findOneAndUpdate: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

import { findOrCreateProduct, updateProductAnalysisHistory } from '../src/services/productService.js';
import { ProductModel } from '../src/models/Product.js';

const findOneAndUpdateMock = vi.mocked(ProductModel.findOneAndUpdate);
const findByIdAndUpdateMock = vi.mocked(ProductModel.findByIdAndUpdate);

beforeEach(() => vi.clearAllMocks());

describe('findOrCreateProduct', () => {
  it('returns null when no URL provided', async () => {
    const result = await findOrCreateProduct({ title: 'iPhone 13', price: 1500, currency: 'ILS' });
    expect(result).toBeNull();
    expect(findOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it('strips query params from URL before deduplication', async () => {
    findOneAndUpdateMock.mockReturnValue({ exec: vi.fn().mockResolvedValue({ _id: 'prod-1' }) } as never);
    await findOrCreateProduct({ title: 'iPhone 13', price: 1500, currency: 'ILS', url: 'https://fb.com/item/123?ref=search' });
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      { canonicalUrl: 'https://fb.com/item/123' },
      expect.anything(),
      expect.anything(),
    );
  });

  it('returns productId string on success', async () => {
    findOneAndUpdateMock.mockReturnValue({ exec: vi.fn().mockResolvedValue({ _id: 'prod-abc' }) } as never);
    const result = await findOrCreateProduct({ title: 'iPhone 13', price: 1500, currency: 'ILS', url: 'https://fb.com/item/123' });
    expect(result).toBe('prod-abc');
  });

  it('returns null when DB not ready', async () => {
    const { isMongoReady } = await import('../src/database/mongoose.js');
    vi.mocked(isMongoReady).mockReturnValueOnce(false);
    const result = await findOrCreateProduct({ title: 'iPhone 13', price: 1500, currency: 'ILS', url: 'https://fb.com/item/123' });
    expect(result).toBeNull();
  });
});

describe('updateProductAnalysisHistory', () => {
  it('calls findByIdAndUpdate with $push $slice and $inc', async () => {
    findByIdAndUpdateMock.mockReturnValue({ exec: vi.fn().mockResolvedValue({}) } as never);
    await updateProductAnalysisHistory('prod-1', {
      analysisId: 'uuid-a',
      verdict: 'worth_it',
      userId: 'user-1',
      timestamp: new Date(),
    });
    expect(findByIdAndUpdateMock).toHaveBeenCalledWith(
      'prod-1',
      expect.objectContaining({
        $push: expect.objectContaining({
          analysisHistory: expect.objectContaining({ $slice: -50 }),
        }),
        $inc: { analysisCount: 1 },
      }),
    );
  });
});
