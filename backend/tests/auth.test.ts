import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

vi.mock('../src/services/googleAuth.js', () => ({
  authenticateWithGoogle: vi.fn(),
  verifyJWT: vi.fn(),
  generateJWT: vi.fn(),
}));

import { authenticateWithGoogle, verifyJWT } from '../src/services/googleAuth.js';

const authMock = vi.mocked(authenticateWithGoogle);
const verifyMock = vi.mocked(verifyJWT);

const MOCK_AUTH_RESPONSE = {
  token: 'mock.jwt.token',
  user: {
    email: 'test@example.com',
    picture: 'https://example.com/pic.jpg',
    name: 'Test User',
    tier: 'free',
    analysesRemaining: 15,
    trialExpiresAt: new Date('2026-06-28'),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /auth/google', () => {
  it('returns 400 when googleToken is missing', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/google').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when googleToken is empty string', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/google').send({ googleToken: '' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with token and user on valid Google token', async () => {
    authMock.mockResolvedValue(MOCK_AUTH_RESPONSE);
    const app = createApp();
    const res = await request(app)
      .post('/auth/google')
      .send({ googleToken: 'valid-google-token' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('email', 'test@example.com');
    expect(res.body.user).toHaveProperty('tier', 'free');
    expect(res.body.user).toHaveProperty('analysesRemaining', 15);
    expect(authMock).toHaveBeenCalledWith('valid-google-token');
  });

  it('returns 500 when Google token verification fails', async () => {
    authMock.mockRejectedValue(new Error('Invalid Google token: audience mismatch'));
    const app = createApp();
    const res = await request(app)
      .post('/auth/google')
      .send({ googleToken: 'bad-token' });
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /auth/logout', () => {
  it('returns 401 without auth token', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/logout');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    verifyMock.mockImplementation(() => { throw new Error('Invalid JWT'); });
    const app = createApp();
    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', 'Bearer bad.token.here');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token and note about client-side discard', async () => {
    verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
    const app = createApp();
    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', 'Bearer valid.token.here');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.note).toMatch(/client-side/i);
  });
});

describe('requireAuth middleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/logout');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing/i);
  });

  it('returns 401 when header does not start with Bearer', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', 'Basic sometoken');
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is expired or invalid', async () => {
    verifyMock.mockImplementation(() => { throw new Error('jwt expired'); });
    const app = createApp();
    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', 'Bearer expired.token');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });
});

