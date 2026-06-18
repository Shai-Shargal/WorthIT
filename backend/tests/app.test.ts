import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/auth/jwt.js';

const TEST_JWT_SECRET = 'test-secret-for-app-tests';

let authHeader: string;

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  authHeader = `Bearer ${signToken({ userId: 'test-user', email: 'test@test.com' })}`;
});

afterAll(() => {
  delete process.env.JWT_SECRET;
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

  it('GET /user/usage returns 200 with usage stats', async () => {
    const app = createApp();
    const res = await request(app).get('/user/usage');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('analysesUsed');
    expect(res.body).toHaveProperty('monthlyAnalysisLimit');
    expect(res.body).toHaveProperty('remainingAnalyses');
    expect(res.body).toHaveProperty('subscriptionPlan');
  });

  it('POST /analysis/analyze with valid body returns 200', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/analysis/analyze')
      .send({ title: 'iPhone 13', price: 1500, currency: 'ILS' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('verdict');
    expect(res.body).toHaveProperty('reasoning');
    expect(res.body).toHaveProperty('analysisId');
    expect(typeof res.body.analysisId).toBe('string');
    expect(res.body.analysisId.length).toBeGreaterThan(0);
  });

  it('POST /analysis/analyze with missing price returns 400', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/analysis/analyze')
      .set('Authorization', authHeader)
      .send({ title: 'iPhone 13', currency: 'ILS' });
    expect(res.status).toBe(400);
  });

  it('GET /analysis/:id returns 503 when storage unavailable (no Mongo in tests)', async () => {
    const app = createApp();
    const res = await request(app).get('/analysis/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Storage unavailable');
  });
});
