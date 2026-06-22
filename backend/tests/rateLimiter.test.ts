import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { rateLimiter, resetStoreForTests } from '../src/middleware/rateLimiter.js';

vi.mock('../src/services/googleAuth.js', () => ({ verifyJWT: vi.fn() }));

function buildApp() {
  const app = express();
  app.use(rateLimiter);
  app.post('/analyze', (_req, res) => res.json({ ok: true }));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  return app;
}

beforeEach(() => resetStoreForTests());
afterEach(() => resetStoreForTests());

describe('rateLimiter', () => {
  it('passes through non-analyze routes', async () => {
    const res = await request(buildApp()).get('/health');
    expect(res.status).toBe(200);
  });

  it('allows requests under the limit', async () => {
    const app = buildApp();
    const res = await request(app).post('/analyze').send({});
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('20');
    expect(res.headers['x-ratelimit-remaining']).toBe('19');
  });

  it('returns 429 when limit exceeded', async () => {
    const app = buildApp();
    // Exhaust the 20-request limit
    for (let i = 0; i < 20; i++) {
      await request(app).post('/analyze').send({});
    }
    const res = await request(app).post('/analyze').send({});
    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('error', 'Too many requests');
    expect(res.body).toHaveProperty('retryAfter');
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('resets count after window expires', async () => {
    vi.useFakeTimers();
    const app = buildApp();

    for (let i = 0; i < 20; i++) {
      await request(app).post('/analyze').send({});
    }
    expect((await request(app).post('/analyze').send({})).status).toBe(429);

    // Advance past the 1-minute window
    vi.advanceTimersByTime(61 * 1000);

    const res = await request(app).post('/analyze').send({});
    expect(res.status).toBe(200);

    vi.useRealTimers();
  });

  it('does not rate limit paths that contain but are not /analyze', async () => {
    const app = express();
    app.use(rateLimiter);
    app.post('/reanalyze', (_req, res) => res.json({ ok: true }));
    const res = await request(app).post('/reanalyze').send({});
    expect(res.status).toBe(200);
  });
});
