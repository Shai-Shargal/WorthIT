import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/authMiddleware.js';
import { AnalysisModel } from '../../database/models/Analysis.js';
import { UserFeedbackModel } from '../../models/UserFeedback.js';

interface FeedbackBody {
  analysisId?: unknown;
  helpful?: unknown;
  accuracy?: unknown;
  notes?: unknown;
}

function validateFeedbackInput(body: FeedbackBody): string | null {
  if (!body.analysisId || typeof body.analysisId !== 'string') {
    return 'analysisId is required';
  }
  if (typeof body.helpful !== 'boolean') {
    return 'helpful must be boolean';
  }
  if (body.accuracy !== undefined &&
      (typeof body.accuracy !== 'number' || body.accuracy < 1 || body.accuracy > 5)) {
    return 'accuracy must be 1-5';
  }
  if (body.notes !== undefined && typeof body.notes !== 'string') {
    return 'notes must be string';
  }
  if (body.notes !== undefined && typeof body.notes === 'string' && body.notes.length > 1000) {
    return 'notes must be 1000 characters or fewer';
  }
  return null;
}

export async function submitFeedbackHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: (err?: unknown) => void,
): Promise<void> {
  try {
    const validationError = validateFeedbackInput(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const { analysisId, helpful, accuracy, notes } = req.body;

    const analysis = await AnalysisModel.findOne({
      analysisId,
      userId: req.userId!,
    }).exec();

    if (!analysis) {
      res.status(404).json({ error: 'Analysis not found or not owned by user' });
      return;
    }

    const feedback = new UserFeedbackModel({
      userId: req.userId!,
      analysisId: analysis._id,
      helpful,
      accuracy,
      notes,
    });

    await feedback.save();

    res.status(201).json({
      id: feedback._id,
      analysisId,
      helpful,
      accuracy,
      createdAt: feedback.createdAt,
    });
  } catch (err) {
    next(err);
  }
}
