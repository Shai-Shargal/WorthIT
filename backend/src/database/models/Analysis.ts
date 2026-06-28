import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const analysisSchema = new Schema(
  {
    analysisId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Optional until Task 3 wires user context into the analysis route
    userId: {
      type: mongoose.Types.ObjectId,
      index: true,
    },
    productId: {
      type: mongoose.Types.ObjectId,
    },
    listing: {
      title: { type: String, required: true },
      price: { type: Number, required: true },
      currency: { type: String, required: true },
      description: String,
      url: { type: String, maxlength: 2048 },
      image: { type: String, maxlength: 2048 },
    },
    // Rich verdict matches shared/types/analysis.ts VerdictResult — the
    // analysis pipeline produces an object, not just a label. Previously this
    // was a String enum which silently CastError'd every save.
    verdict: {
      verdict: {
        type: String,
        enum: ['worth_it', 'maybe', 'avoid'],
        required: true,
      },
      worthRating: { type: Number, required: true },
      confidence: { type: Number, required: true, min: 0, max: 1 },
      confidenceLevel: {
        type: String,
        enum: ['low', 'medium', 'high'],
        required: true,
      },
      estimatedValue: {
        min: Number,
        max: Number,
        currency: String,
      },
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
    sellerInfo: {
      name: String,
      rating: Number,
      ratingCount: Number,
      responseTime: String,
      redFlags: [String],
    },
    marketData: {
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
          enum: ['real', 'seed', 'limited', 'insufficient'],
        },
      },
      historicalContext: {
        priceHistory: [{ price: Number, timestamp: Date }],
        trend: {
          type: String,
          enum: ['increasing', 'stable', 'decreasing'],
        },
      },
    },
    feedback: {
      helpful: { type: Boolean },
      submittedAt: { type: Date },
    },
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
    collection: 'analyses',
    versionKey: false,
  },
);

analysisSchema.index({ userId: 1, createdAt: -1 });
analysisSchema.index({ productId: 1 });

export type AnalysisDoc = InferSchemaType<typeof analysisSchema>;

export const AnalysisModel =
  mongoose.models.Analysis ?? mongoose.model('Analysis', analysisSchema);
