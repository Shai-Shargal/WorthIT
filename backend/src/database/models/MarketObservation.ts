import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const marketObservationSchema = new Schema(
  {
    productName: { type: String, required: true, trim: true, index: true },
    productNameLower: { type: String, required: true, trim: true, index: true },
    observedPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 8 },
    source: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 5000 },
    condition: { type: String, trim: true },
    location: { type: String, trim: true },
    timestamp: { type: Date, required: true, default: () => new Date(), index: true },
  },
  {
    collection: 'market_observations',
    versionKey: false,
  },
);

marketObservationSchema.index({ productNameLower: 1, timestamp: -1 });

export type MarketObservationDoc = InferSchemaType<typeof marketObservationSchema>;

export const MarketObservationModel =
  mongoose.models.MarketObservation ??
  mongoose.model('MarketObservation', marketObservationSchema);
