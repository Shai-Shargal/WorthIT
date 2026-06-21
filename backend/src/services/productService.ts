import { ProductModel } from '../models/Product.js';
import { isMongoReady } from '../database/mongoose.js';
import type { ProductSchemaInput } from '../analysis/productSchema.js';

export async function findOrCreateProduct(
  listing: ProductSchemaInput,
  marketplace: string = 'facebook',
): Promise<string | null> {
  if (!isMongoReady()) return null;

  try {
    const canonicalUrl = listing.url || listing.title; // Use URL if available, else title as fallback

    const setOnInsert: Record<string, unknown> = {
      canonicalUrl,
      marketplace,
      title: listing.title,
    };

    const product = await ProductModel.findOneAndUpdate(
      { canonicalUrl },
      {
        $setOnInsert: setOnInsert,
        $set: {
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    ).exec();

    return product._id.toString();
  } catch (err) {
    console.error('[productService] findOrCreate failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function updateProductAnalysisHistory(
  productId: string,
  analysisData: {
    analysisId: string;
    verdict: 'worth_it' | 'maybe' | 'avoid';
    userId: string;
    timestamp: Date;
  },
): Promise<void> {
  if (!isMongoReady()) return;

  try {
    await ProductModel.findByIdAndUpdate(
      productId,
      {
        $push: {
          analysisHistory: analysisData,
        },
        $set: {
          lastAnalyzedAt: new Date(),
        },
      },
    ).exec();
  } catch (err) {
    console.error('[productService] updateHistory failed:', err instanceof Error ? err.message : err);
  }
}
