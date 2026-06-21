import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/models/User.js', () => ({
  UserModel: {
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('../src/models/UsageLog.js', () => ({
  UsageLogModel: {
    findOneAndUpdate: vi.fn(),
  },
}));

import { checkQuotaAndIncrement, getAnalysesRemaining } from '../src/services/quotaService.js';
import { UserModel } from '../src/models/User.js';
import { UsageLogModel } from '../src/models/UsageLog.js';

const findByIdMock = vi.mocked(UserModel.findById);
const findOneAndUpdateMock = vi.mocked(UserModel.findOneAndUpdate);
const updateOneMock = vi.mocked(UserModel.updateOne);
const usageLogMock = vi.mocked(UsageLogModel.findOneAndUpdate);

const BASE_USER = {
  _id: 'user-123',
  email: 'test@example.com',
  tier: 'free',
  analysesUsedThisMonth: 0,
  monthStartDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  trialExpiresAt: undefined,
  lastAnalysisAt: undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
  usageLogMock.mockResolvedValue({} as never);
  updateOneMock.mockResolvedValue({} as never);
});

describe('checkQuotaAndIncrement', () => {
  it('returns not allowed when user not found', async () => {
    findByIdMock.mockResolvedValue(null);
    const result = await checkQuotaAndIncrement('missing-id');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });

  it('allows and bypasses quota when trial is active', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    findByIdMock.mockResolvedValue({ ...BASE_USER, trialExpiresAt: futureDate });
    const result = await checkQuotaAndIncrement('user-123');
    expect(result.allowed).toBe(true);
    expect(result.analysesRemaining).toBe(15);
    expect(findOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it('allows and increments atomically when quota not exceeded', async () => {
    findByIdMock.mockResolvedValue({ ...BASE_USER, analysesUsedThisMonth: 5 });
    findOneAndUpdateMock.mockResolvedValue({ ...BASE_USER, analysesUsedThisMonth: 6 });
    const result = await checkQuotaAndIncrement('user-123');
    expect(result.allowed).toBe(true);
    expect(result.analysesRemaining).toBe(9); // 15 - 6
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      { _id: 'user-123', analysesUsedThisMonth: { $lt: 15 } },
      expect.objectContaining({ $inc: { analysesUsedThisMonth: 1 } }),
      { new: true },
    );
    expect(usageLogMock).toHaveBeenCalledOnce();
  });

  it('blocks and returns 0 remaining when quota exceeded', async () => {
    findByIdMock.mockResolvedValue({ ...BASE_USER, analysesUsedThisMonth: 15 });
    findOneAndUpdateMock.mockResolvedValue(null); // $lt check fails
    const result = await checkQuotaAndIncrement('user-123');
    expect(result.allowed).toBe(false);
    expect(result.analysesRemaining).toBe(0);
    expect(result.reason).toMatch(/quota exceeded/i);
    expect(usageLogMock).not.toHaveBeenCalled();
  });

  it('resets monthly counter before checking when month has rolled over', async () => {
    const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    findByIdMock.mockResolvedValue({ ...BASE_USER, analysesUsedThisMonth: 15, monthStartDate: lastMonth });
    findOneAndUpdateMock.mockResolvedValue({ ...BASE_USER, analysesUsedThisMonth: 1 });
    const result = await checkQuotaAndIncrement('user-123');
    expect(updateOneMock).toHaveBeenCalledWith(
      { _id: 'user-123' },
      expect.objectContaining({ $set: expect.objectContaining({ analysesUsedThisMonth: 0 }) }),
    );
    expect(result.allowed).toBe(true);
  });
});

describe('getAnalysesRemaining', () => {
  it('returns 0 when user not found', async () => {
    findByIdMock.mockResolvedValue(null);
    expect(await getAnalysesRemaining('missing')).toBe(0);
  });

  it('returns correct remaining count', async () => {
    findByIdMock.mockResolvedValue({ ...BASE_USER, analysesUsedThisMonth: 10 });
    expect(await getAnalysesRemaining('user-123')).toBe(5);
  });

  it('returns 0 when exactly at limit', async () => {
    findByIdMock.mockResolvedValue({ ...BASE_USER, analysesUsedThisMonth: 15 });
    expect(await getAnalysesRemaining('user-123')).toBe(0);
  });

  it('resets and returns full limit when month has rolled over', async () => {
    const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    findByIdMock.mockResolvedValue({ ...BASE_USER, analysesUsedThisMonth: 15, monthStartDate: lastMonth });
    expect(await getAnalysesRemaining('user-123')).toBe(15);
    expect(updateOneMock).toHaveBeenCalledOnce();
  });
});
