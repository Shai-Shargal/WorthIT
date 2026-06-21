import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

vi.mock('../src/services/googleAuth.js', () => ({
  verifyJWT: vi.fn(),
}));

vi.mock('../src/services/quotaService.js', () => ({
  getAnalysesRemaining: vi.fn(),
}));

vi.mock('../src/models/User.js', () => ({
  UserModel: {
    findById: vi.fn(),
  },
}));

import { verifyJWT } from '../src/services/googleAuth.js';
import { getAnalysesRemaining } from '../src/services/quotaService.js';
import { UserModel } from '../src/models/User.js';

const verifyMock = vi.mocked(verifyJWT);
const remainingMock = vi.mocked(getAnalysesRemaining);
const userMock = vi.mocked(UserModel.findById);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /user/me', () => {
  it('returns user profile with analyses remaining', async () => {
    verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
    remainingMock.mockResolvedValue(15);
    userMock.mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        _id: 'user-123',
        email: 'test@example.com',
        tier: 'free',
        analysesUsedThisMonth: 0,
        trialExpiresAt: undefined,
        createdAt: new Date(),
      }),
    } as any);

    const app = createApp();
    const res = await request(app)
      .get('/user/me')
      .set('Authorization', 'Bearer valid.token.here');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('email', 'test@example.com');
    expect(res.body).toHaveProperty('tier', 'free');
    expect(res.body).toHaveProperty('analysesRemaining', 15);
    expect(res.body).toHaveProperty('createdAt');
  });

  it('returns 401 without auth token', async () => {
    const app = createApp();
    const res = await request(app).get('/user/me');
    expect(res.status).toBe(401);
  });
});
