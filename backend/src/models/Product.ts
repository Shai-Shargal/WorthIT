import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const productSchema = new Schema(
  {
    canonicalUrl: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    marketplace: {
      type: String,
      enum: ['facebook', 'yad2', 'ebay', 'amazon'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    category: String,
    specs: {
      brand: String,
      model: String,
      year: Number,
      condition: {
        type: String,
        enum: ['like_new', 'good', 'fair', 'poor'],
      },
      storage: String,
      ram: String,
      color: String,
    },
    analysisCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastAnalyzedAt: Date,
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'products',
    versionKey: false,
  },
);

productSchema.index({ lastAnalyzedAt: -1 });

export type ProductDoc = InferSchemaType<typeof productSchema>;

export const ProductModel =
  mongoose.models.Product ?? mongoose.model('Product', productSchema);
