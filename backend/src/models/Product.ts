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
    analysisHistory: [
      {
        analysisId: String,
        verdict: {
          type: String,
          enum: ['worth_it', 'maybe', 'avoid'],
        },
        verdictReason: {
          type: String,
          enum: ['overpriced', 'fair', 'underpriced', 'insufficient_data'],
        },
        reasoning: {
          summary: String,
          positives: [String],
          concerns: [String],
        },
        redFlags: [
          {
            category: {
              type: String,
              enum: ['seller', 'price', 'condition', 'photo', 'description'],
            },
            severity: {
              type: String,
              enum: ['caution', 'warning', 'high_risk'],
            },
            description: String,
          },
        ],
        localMarketContext: {
          p25: Number,
          p50: Number,
          p75: Number,
          mean: Number,
          count: Number,
          source: {
            type: String,
            enum: ['db', 'tavily', 'web'],
          },
          dataQuality: {
            type: String,
            enum: ['real', 'limited', 'insufficient'],
          },
        },
        historicalContext: {
          priceHistory: [
            {
              price: Number,
              timestamp: Date,
            },
          ],
          trend: {
            type: String,
            enum: ['increasing', 'stable', 'decreasing'],
          },
        },
        userId: mongoose.Types.ObjectId,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    marketObservations: [
      {
        observedPrice: Number,
        currency: String,
        source: String,
        timestamp: Date,
      },
    ],
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
