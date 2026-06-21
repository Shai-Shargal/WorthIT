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

  // Full OAuth tests require real MongoDB, moved to Task 9 integration tests
  // For MVP unit tests, we validate input validation only
});
