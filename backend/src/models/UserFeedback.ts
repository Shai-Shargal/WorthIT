import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const userFeedbackSchema = new Schema(
  {
    userId: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // References Analysis._id (ObjectId), not the UUID analysisId string field
    analysisId: {
      type: mongoose.Types.ObjectId,
      ref: 'Analysis',
      required: true,
      index: true,
    },
    helpful: {
      type: Boolean,
      required: true,
    },
    accuracy: {
      type: Number,
      min: 1,
      max: 5,
    },
    notes: {
      type: String,
      maxlength: 1000,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: 'user_feedback',
    versionKey: false,
  },
);

export type UserFeedbackDoc = InferSchemaType<typeof userFeedbackSchema>;

export const UserFeedbackModel =
  mongoose.models.UserFeedback ?? mongoose.model('UserFeedback', userFeedbackSchema);
