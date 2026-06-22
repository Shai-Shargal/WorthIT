import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

vi.mock('../../src/services/googleAuth.js', () => ({
  verifyJWT: vi.fn(),
}));

vi.mock('../../src/models/User.js', () => ({
  UserModel: {
    findById: vi.fn(),
  },
}));

vi.mock('../../src/database/models/Analysis.js', () => ({
  AnalysisModel: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock('../../src/models/UserFeedback.js', () => ({
  UserFeedbackModel: vi.fn(),
}));

import { verifyJWT } from '../../src/services/googleAuth.js';
import { UserModel } from '../../src/models/User.js';
import { AnalysisModel } from '../../src/database/models/Analysis.js';
import { UserFeedbackModel } from '../../src/models/UserFeedback.js';

const verifyMock = vi.mocked(verifyJWT);
const userMock = vi.mocked(UserModel.findById);
const analysisFindMock = vi.mocked(AnalysisModel.find);
const analysisCountMock = vi.mocked(AnalysisModel.countDocuments);
const analysisFindOneMock = vi.mocked(AnalysisModel.findOne);
const feedbackMock = vi.mocked(UserFeedbackModel);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('User Endpoints Integration', () => {
  describe('GET /user/me', () => {
    it('returns user profile with quota info', async () => {
      verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
      userMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: 'user-123',
          email: 'test@example.com',
          tier: 'free',
          analysesUsedThisMonth: 3, // 15 limit - 3 used = 12 remaining
          trialExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          createdAt: new Date('2026-06-01'),
        }),
      } as any);

      const app = createApp();
      const res = await request(app)
        .get('/user/me')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 'user-123');
      expect(res.body).toHaveProperty('email', 'test@example.com');
      expect(res.body).toHaveProperty('tier', 'free');
      expect(res.body).toHaveProperty('analysesRemaining', 12); // 15 - 3
      expect(res.body).toHaveProperty('trialExpiresAt');
      expect(res.body).toHaveProperty('createdAt');
    });

    it('returns 404 if user not found', async () => {
      verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
      userMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      } as any);

      const app = createApp();
      const res = await request(app)
        .get('/user/me')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /user/analyses', () => {
    it('returns paginated list of user analyses', async () => {
      verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
      analysisFindMock.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          { _id: 'analysis-1', analysisId: 'uuid-1', verdict: 'worth_it' },
          { _id: 'analysis-2', analysisId: 'uuid-2', verdict: 'maybe' },
        ]),
      } as any);
      analysisCountMock.mockResolvedValue(10);

      const app = createApp();
      const res = await request(app)
        .get('/user/analyses?limit=20&offset=0')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('analyses');
      expect(Array.isArray(res.body.analyses)).toBe(true);
      expect(res.body).toHaveProperty('total', 10);
      expect(res.body).toHaveProperty('limit', 20);
      expect(res.body).toHaveProperty('offset', 0);
      expect(res.body).toHaveProperty('hasMore', false);
    });

    it('validates marketplace parameter', async () => {
      verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });

      const app = createApp();
      const res = await request(app)
        .get('/user/analyses?marketplace=invalid')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('enforces max limit of 100', async () => {
      verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
      analysisFindMock.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      } as any);
      analysisCountMock.mockResolvedValue(0);

      const app = createApp();
      const res = await request(app)
        .get('/user/analyses?limit=1000&offset=0')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      // The actual limit used should be capped at 100
      expect(analysisFindMock.mock.results[0].value.limit.mock.calls[0][0]).toBe(100);
    });
  });

  describe('POST /user/feedback', () => {
    it('creates feedback for own analysis', async () => {
      verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
      analysisFindOneMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          _id: 'analysis-obj-id',
          analysisId: 'uuid-123',
          userId: 'user-123',
        }),
      } as any);

      const mockFeedback = {
        _id: 'feedback-123',
        createdAt: new Date(),
        save: vi.fn().mockResolvedValue(undefined),
      };
      feedbackMock.mockImplementation(() => mockFeedback as any);

      const app = createApp();
      const res = await request(app)
        .post('/user/feedback')
        .set('Authorization', 'Bearer valid-token')
        .send({
          analysisId: 'uuid-123',
          helpful: true,
          accuracy: 4,
          notes: 'Great analysis',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 'feedback-123');
      expect(res.body).toHaveProperty('helpful', true);
      expect(res.body).toHaveProperty('accuracy', 4);
    });

    it('validates feedback input', async () => {
      verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });

      const app = createApp();

      // Missing analysisId
      let res = await request(app)
        .post('/user/feedback')
        .set('Authorization', 'Bearer valid-token')
        .send({ helpful: true });
      expect(res.status).toBe(400);

      // Missing helpful
      res = await request(app)
        .post('/user/feedback')
        .set('Authorization', 'Bearer valid-token')
        .send({ analysisId: 'uuid-123' });
      expect(res.status).toBe(400);

      // Invalid accuracy (>5)
      res = await request(app)
        .post('/user/feedback')
        .set('Authorization', 'Bearer valid-token')
        .send({ analysisId: 'uuid-123', helpful: true, accuracy: 6 });
      expect(res.status).toBe(400);

      // Notes too long
      res = await request(app)
        .post('/user/feedback')
        .set('Authorization', 'Bearer valid-token')
        .send({
          analysisId: 'uuid-123',
          helpful: true,
          notes: 'x'.repeat(1001),
        });
      expect(res.status).toBe(400);
    });

    it('returns 404 if analysis not owned by user', async () => {
      verifyMock.mockReturnValue({ userId: 'user-123', email: 'test@example.com', tier: 'free' });
      analysisFindOneMock.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      } as any);

      const app = createApp();
      const res = await request(app)
        .post('/user/feedback')
        .set('Authorization', 'Bearer valid-token')
        .send({
          analysisId: 'uuid-456',
          helpful: true,
        });

      expect(res.status).toBe(404);
    });
  });
});
