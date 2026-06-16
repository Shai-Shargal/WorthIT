import { Router } from 'express';
import { getUsageStats } from './usageTracker.js';

export const userRouter = Router();

userRouter.get('/usage', (_req, res) => {
  res.json(getUsageStats());
});
