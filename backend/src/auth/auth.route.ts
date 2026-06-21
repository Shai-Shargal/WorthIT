import { Router } from 'express';
import { z } from 'zod';
import { authenticateWithGoogle } from '../services/googleAuth.js';
import { requireAuth } from '../middleware/authMiddleware.js';

export const authRouter = Router();

const googleAuthSchema = z.object({
  googleToken: z.string().min(1),
});

authRouter.post('/google', async (req, res, next) => {
  try {
    const parsed = googleAuthSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Missing googleToken' });
    }

    const authResponse = await authenticateWithGoogle(parsed.data.googleToken);
    res.json(authResponse);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', requireAuth, (_req, res) => {
  // Token blacklisting (Redis) deferred to post-MVP.
  // Client is responsible for discarding the token.
  res.json({ success: true, note: 'Discard token client-side — server-side invalidation not yet implemented' });
});
