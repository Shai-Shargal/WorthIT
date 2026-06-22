import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

vi.mock('../src/services/googleAuth.js', () => ({
  verifyJWT: vi.fn(),
}));

vi.mock('../src/services/quotaService.js', () => ({
  checkQuotaAndIncrement: vi.fn(),
  getAnalysesRemaining: vi.fn(),
}));

vi.mock('../src/models/User.js', () => ({
  UserModel: {
    findById: vi.fn(),
  },
}));

vi.mock('../src/database/models/Analysis.js', () => ({
  AnalysisModel: {
    findOne: vi.fn(),
  },
}));

import { verifyJWT } from '../src/services/googleAuth.js';
import { checkQuotaAndIncrement } from '../src/services/quotaService.js';
import { UserModel } from '../src/models/User.js';
import { AnalysisModel } from '../src/database/models/Analysis.js';

const verifyMock = vi.mocked(verifyJWT);
const quotaMock = vi.mocked(checkQuotaAndIncrement);
const userMock = vi.mocked(UserModel.findById);
const analysisMock = vi.mocked(AnalysisModel.findOne);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('app startup', () => {
  it('GET /health returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /auth/google returns 400 when googleToken is missing', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/google').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /analysis/analyze with valid body returns 200 with valid auth', async () => {
    verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
    quotaMock.mockResolvedValue({ allowed: true, analysesRemaining: 14 });

    const app = createApp();
    const res = await request(app)
      .post('/analysis/analyze')
      .set('Authorization', 'Bearer valid.token.here')
      .send({ title: 'iPhone 13', price: 1500, currency: 'ILS' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('verdict');
    expect(res.body).toHaveProperty('reasoning');
    expect(res.body).toHaveProperty('analysisId');
    expect(res.body).toHaveProperty('analysesRemaining', 14);
  });

  it('POST /analysis/analyze with missing price returns 400', async () => {
    verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });

    const app = createApp();
    const res = await request(app)
      .post('/analysis/analyze')
      .set('Authorization', 'Bearer valid.token.here')
      .send({ title: 'iPhone 13', currency: 'ILS' });
    expect(res.status).toBe(400);
  });

  it('POST /analysis/analyze returns 401 without auth token', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/analysis/analyze')
      .send({ title: 'iPhone 13', price: 1500, currency: 'ILS' });
    expect(res.status).toBe(401);
  });

  it('GET /analysis/:id requires auth token', async () => {
    const app = createApp();
    const res = await request(app).get('/analysis/test-id');
    expect(res.status).toBe(401);
  });
});
