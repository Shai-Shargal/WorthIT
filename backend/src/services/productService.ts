import { ProductModel } from '../models/Product.js';
import { isMongoReady } from '../database/mongoose.js';
import type { ProductSchemaInput } from '../analysis/productSchema.js';

export async function findOrCreateProduct(
  listing: ProductSchemaInput,
  marketplace: string = 'facebook',
): Promise<string | null> {
  if (!isMongoReady()) return null;
  if (!listing.url) return null; // No URL = can't deduplicate reliably

  try {
    const canonicalUrl = listing.url.split('?')[0]; // strip query params

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
          analysisHistory: {
            $each: [analysisData],
            $slice: -50, // keep last 50 only — prevents unbounded growth
          },
        },
        $inc: { analysisCount: 1 },
        $set: { lastAnalyzedAt: new Date() },
      },
    ).exec();
  } catch (err) {
    console.error('[productService] updateHistory failed:', err instanceof Error ? err.message : err);
  }
}
