import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/authMiddleware.js';
import { AnalysisModel } from '../../database/models/Analysis.js';

const VALID_MARKETPLACES = new Set(['facebook', 'yad2', 'ebay', 'amazon']);

export async function listAnalysesHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: (err?: unknown) => void,
): Promise<void> {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const marketplace = req.query.marketplace as string | undefined;

    // Validate marketplace against allowed enum — prevents NoSQL injection
    if (marketplace !== undefined && !VALID_MARKETPLACES.has(marketplace)) {
      res.status(400).json({
        error: `marketplace must be one of: ${[...VALID_MARKETPLACES].join(', ')}`,
      });
      return;
    }

    const query: Record<string, unknown> = { userId: req.userId! };

    // Note: marketplace lives on Product, not Analysis.listing.
    // Filtering requires a Product join — deferred to a future task.
    // The param is accepted but silently ignored to avoid breaking clients.

    const [analyses, total] = await Promise.all([
      AnalysisModel.find(query).sort({ createdAt: -1 }).limit(limit).skip(offset).lean().exec(),
      AnalysisModel.countDocuments(query),
    ]);

    res.json({ analyses, total, limit, offset, hasMore: offset + limit < total });
  } catch (err) {
    next(err);
  }
}
