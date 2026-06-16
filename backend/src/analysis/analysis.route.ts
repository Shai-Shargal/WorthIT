import { Router } from 'express';

export const analysisRouter = Router();

analysisRouter.post('/analyze', (_req, res) => {
  res.status(501).json({ error: 'Not yet implemented' });
});

analysisRouter.get('/:id', (_req, res) => {
  res.status(501).json({ error: 'Not yet implemented' });
});
