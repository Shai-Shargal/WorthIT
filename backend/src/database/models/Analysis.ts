import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const analysisSchema = new Schema(
  {
    analysisId: { type: String, required: true, unique: true, index: true },
    listing: { type: Schema.Types.Mixed, required: true },
    verdict: { type: Schema.Types.Mixed, required: true },
    reasoning: { type: Schema.Types.Mixed, required: true },
    localMarketContext: { type: Schema.Types.Mixed },
    historicalContext: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: () => new Date(), index: true },
  },
  { collection: 'analyses', versionKey: false },
);

export type AnalysisDoc = InferSchemaType<typeof analysisSchema>;

export const AnalysisModel: mongoose.Model<AnalysisDoc> =
  (mongoose.models.Analysis as mongoose.Model<AnalysisDoc>) ??
  mongoose.model('Analysis', analysisSchema);
