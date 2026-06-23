import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

vi.mock('../../src/services/googleAuth.js', () => ({
  authenticateWithGoogle: vi.fn(),
  verifyJWT: vi.fn(),
}));

import { authenticateWithGoogle, verifyJWT } from '../../src/services/googleAuth.js';

const authMock = vi.mocked(authenticateWithGoogle);
const verifyMock = vi.mocked(verifyJWT);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Auth Integration - Google OAuth Flow', () => {
  it('POST /auth/google creates user on first login', async () => {
    authMock.mockResolvedValue({
      token: 'internal-jwt-token',
      user: {
        email: 'newuser@example.com',
        picture: 'https://example.com/pic.jpg',
        name: 'New User',
        tier: 'free',
        analysesRemaining: 15,
        trialExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const app = createApp();
    const res = await request(app).post('/auth/google').send({
      googleToken: 'valid-google-jwt-from-frontend',
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token', 'internal-jwt-token');
    expect(res.body.user).toHaveProperty('email', 'newuser@example.com');
    expect(res.body.user).toHaveProperty('tier', 'free');
    expect(res.body.user).toHaveProperty('analysesRemaining', 15);
    expect(authMock).toHaveBeenCalledWith('valid-google-jwt-from-frontend');
  });

  it('POST /auth/google returns 400 for missing token', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/google').send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(authMock).not.toHaveBeenCalled();
  });

  it('POST /auth/google returns 400 for empty token', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/google').send({ googleToken: '' });

    expect(res.status).toBe(400);
    expect(authMock).not.toHaveBeenCalled();
  });

  it('POST /auth/google returns 500 on authentication failure', async () => {
    authMock.mockRejectedValue(new Error('Invalid Google token: audience mismatch'));

    const app = createApp();
    const res = await request(app).post('/auth/google').send({
      googleToken: 'invalid-token',
    });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /auth/logout requires auth token', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/logout');

    expect(res.status).toBe(401);
  });

  it('POST /auth/logout returns 200 with valid token', async () => {
    verifyMock.mockReturnValue({
      userId: 'user-123',
      email: 'test@example.com',
      tier: 'free',
    });

    const app = createApp();
    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', 'Bearer valid-jwt-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('POST /auth/logout returns 401 with invalid token', async () => {
    verifyMock.mockImplementation(() => {
      throw new Error('Invalid JWT');
    });

    const app = createApp();
    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', 'Bearer invalid-jwt-token');

    expect(res.status).toBe(401);
  });

  it('Protected endpoints reject requests without auth token', async () => {
    const app = createApp();

    // /analysis/analyze is intentionally open during pre-PMF algorithm
    // iteration — see optionalAuth + analysis.route.ts. The user routes stay
    // gated since they expose user-scoped data.
    const endpoints = [
      { method: 'get', path: '/user/me' },
      { method: 'get', path: '/user/analyses' },
    ];

    for (const { method, path, body } of endpoints) {
      const req = request(app)[method as 'post' | 'get'](path);
      if (body) req.send(body);
      const res = await req;
      expect(res.status).toBe(401);
    }
  });

});
