import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { signToken } from './jwt.js';

export const authRouter = Router();

authRouter.post('/google', (req, res, next) => {
  try {
    const { googleToken } = req.body as { googleToken?: unknown };

    if (typeof googleToken !== 'string' || !googleToken.trim()) {
      return res.status(400).json({ error: 'googleToken is required' });
    }

    // MVP stub: accept any non-empty token, generate a synthetic user.
    // Replace this block with real Google token verification in production.
    const userId = randomUUID();
    const email = `user-${userId.slice(0, 8)}@worthit.stub`;

    const accessToken = signToken({ userId, email });

    return res.json({
      user: { id: userId, email, fullName: 'WorthIT User', profilePicture: null },
      accessToken,
    });
  } catch (err) {
    next(err);
  }
});
