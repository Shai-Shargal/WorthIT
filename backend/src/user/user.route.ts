import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getMeHandler } from './endpoints/getMe.js';
import { listAnalysesHandler } from './endpoints/listAnalyses.js';
import { submitFeedbackHandler } from './endpoints/submitFeedback.js';

export const userRouter = Router();

userRouter.get('/me', requireAuth, getMeHandler);
userRouter.get('/analyses', requireAuth, listAnalysesHandler);
userRouter.post('/feedback', requireAuth, submitFeedbackHandler);
