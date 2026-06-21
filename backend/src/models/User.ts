import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      unique: true,
      index: true,
    },
    googleId: {
      type: String,
      required: true,
      unique: true,
    },
    googlePicture: String,
    googleName: String,
    tier: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free',
    },
    trialExpiresAt: {
      type: Date,
      index: true,
    },
    analysesUsedThisMonth: {
      type: Number,
      default: 0,
      min: 0,
    },
    monthStartDate: {
      type: Date,
      default: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    },
    lastAnalysisAt: Date,
    preferences: {
      notifications: { type: Boolean, default: true },
      saveHistory: { type: Boolean, default: true },
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: 'users',
    versionKey: false,
  },
);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const UserModel =
  mongoose.models.User ?? mongoose.model('User', userSchema);
