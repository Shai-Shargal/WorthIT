import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

vi.mock('../src/services/googleAuth.js', () => ({ verifyJWT: vi.fn() }));
vi.mock('../src/database/models/Analysis.js', () => ({
  AnalysisModel: { find: vi.fn(), countDocuments: vi.fn(), findOne: vi.fn() },
}));
vi.mock('../src/models/UserFeedback.js', () => ({
  UserFeedbackModel: vi.fn().mockImplementation(() => ({
    save: vi.fn().mockResolvedValue(undefined),
    _id: 'fb-id-1',
    createdAt: new Date(),
  })),
}));

import { verifyJWT } from '../src/services/googleAuth.js';
import { AnalysisModel } from '../src/database/models/Analysis.js';

const verifyMock = vi.mocked(verifyJWT);
const findMock = vi.mocked(AnalysisModel.find);
const countMock = vi.mocked(AnalysisModel.countDocuments);
const findOneMock = vi.mocked(AnalysisModel.findOne);

const AUTH = { Authorization: 'Bearer valid.token' };

beforeEach(() => {
  vi.clearAllMocks();
  verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
});

describe('GET /user/analyses', () => {
  it('returns 401 without auth', async () => {
    const res = await request(createApp()).get('/user/analyses');
    expect(res.status).toBe(401);
  });

  it('returns paginated analyses', async () => {
    findMock.mockReturnValue({ sort: () => ({ limit: () => ({ skip: () => ({ lean: () => ({ exec: vi.fn().mockResolvedValue([{ analysisId: 'a1' }]) }) }) }) }) } as never);
    countMock.mockResolvedValue(1 as never);
    const res = await request(createApp()).get('/user/analyses').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('analyses');
    expect(res.body).toHaveProperty('total', 1);
    expect(res.body).toHaveProperty('hasMore', false);
  });

  it('rejects invalid marketplace enum', async () => {
    const res = await request(createApp()).get('/user/analyses?marketplace=instagram').set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/marketplace/i);
  });

  it('accepts valid marketplace value', async () => {
    findMock.mockReturnValue({ sort: () => ({ limit: () => ({ skip: () => ({ lean: () => ({ exec: vi.fn().mockResolvedValue([]) }) }) }) }) } as never);
    countMock.mockResolvedValue(0 as never);
    const res = await request(createApp()).get('/user/analyses?marketplace=facebook').set(AUTH);
    expect(res.status).toBe(200);
  });
});

describe('POST /user/feedback', () => {
  it('returns 401 without auth', async () => {
    const res = await request(createApp()).post('/user/feedback').send({ analysisId: 'a1', helpful: true });
    expect(res.status).toBe(401);
  });

  it('returns 400 when analysisId missing', async () => {
    const res = await request(createApp()).post('/user/feedback').set(AUTH).send({ helpful: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/analysisId/i);
  });

  it('returns 400 when helpful is not boolean', async () => {
    const res = await request(createApp()).post('/user/feedback').set(AUTH).send({ analysisId: 'a1', helpful: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/helpful/i);
  });

  it('returns 400 when accuracy is out of range', async () => {
    const res = await request(createApp()).post('/user/feedback').set(AUTH).send({ analysisId: 'a1', helpful: true, accuracy: 6 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when notes exceed 1000 chars', async () => {
    const res = await request(createApp()).post('/user/feedback').set(AUTH)
      .send({ analysisId: 'a1', helpful: true, notes: 'x'.repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1000/);
  });

  it('returns 404 when analysis not found or not owned', async () => {
    findOneMock.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) } as never);
    const res = await request(createApp()).post('/user/feedback').set(AUTH)
      .send({ analysisId: 'unknown', helpful: true });
    expect(res.status).toBe(404);
  });

  it('returns 201 on valid feedback', async () => {
    findOneMock.mockReturnValue({ exec: vi.fn().mockResolvedValue({ _id: 'analysis-obj-id' }) } as never);
    const res = await request(createApp()).post('/user/feedback').set(AUTH)
      .send({ analysisId: 'a1', helpful: true, accuracy: 4 });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('helpful', true);
  });
});
