import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('POST /auth/google', () => {
  it('returns 400 when googleToken is missing', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/google').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 200 with user and accessToken for any non-empty token', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const app = createApp();
    const res = await request(app)
      .post('/auth/google')
      .send({ googleToken: 'any-google-token' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).toHaveProperty('email');
    delete process.env.JWT_SECRET;
  });

  it('returns 500 when JWT_SECRET is not set', async () => {
    delete process.env.JWT_SECRET;
    const app = createApp();
    const res = await request(app)
      .post('/auth/google')
      .send({ googleToken: 'any-google-token' });
    expect(res.status).toBe(500);
  });
});
