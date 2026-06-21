import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const usageLogSchema = new Schema(
  {
    userId: {
      type: mongoose.Types.ObjectId,
      required: true,
      index: true,
    },
    yearMonth: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/,
      index: true,
    },
    analysesUsed: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'usage_logs',
    versionKey: false,
  },
);

usageLogSchema.index({ userId: 1, yearMonth: 1 }, { unique: true });

export type UsageLogDoc = InferSchemaType<typeof usageLogSchema>;

export const UsageLogModel =
  mongoose.models.UsageLog ?? mongoose.model('UsageLog', usageLogSchema);
