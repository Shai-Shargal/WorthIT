import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetUsageForTests } from '../src/usage/usageTracker.js';

beforeEach(() => {
  resetUsageForTests();
});

describe('GET /user/usage', () => {
  it('returns usage stats with 200', async () => {
    const app = createApp();
    const res = await request(app).get('/user/usage');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('analysesUsed');
    expect(res.body).toHaveProperty('monthlyAnalysisLimit');
    expect(res.body).toHaveProperty('remainingAnalyses');
    expect(res.body).toHaveProperty('subscriptionPlan');
  });

  it('analysesUsed starts at 0', async () => {
    const app = createApp();
    const res = await request(app).get('/user/usage');
    expect(res.body.analysesUsed).toBe(0);
  });
});
