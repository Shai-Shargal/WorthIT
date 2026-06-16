import { Router } from 'express';

export const userRouter = Router();

userRouter.get('/usage', (_req, res) => {
  res.status(501).json({ error: 'Not yet implemented' });
});
