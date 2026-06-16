import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

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

  it('GET /analysis/some-id returns 404 or 501 (stub)', async () => {
    const app = createApp();
    const res = await request(app).get('/analysis/nonexistent-id');
    expect([404, 501]).toContain(res.status);
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
  });

  it('POST /analysis/analyze with missing price returns 400', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/analysis/analyze')
      .send({ title: 'iPhone 13', currency: 'ILS' });
    expect(res.status).toBe(400);
  });

  it('GET /analysis/:id returns 404 for unknown id', async () => {
    const app = createApp();
    const res = await request(app).get('/analysis/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Analysis not found');
  });
});
