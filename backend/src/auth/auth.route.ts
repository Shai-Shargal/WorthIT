import { Router } from 'express';

export const authRouter = Router();

authRouter.post('/google', (_req, res) => {
  res.status(501).json({ error: 'Auth not yet implemented' });
});
