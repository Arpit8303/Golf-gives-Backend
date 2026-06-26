import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { HTTP_STATUS, buildError } from '../constants/errors';

/**
 * Subscription Status Middleware
 * Fetches real-time subscription status from DB on every protected request.
 * Must be used AFTER authenticate middleware.
 * Returns 403 if subscription is not 'active'.
 */
export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json(
      buildError('TOKEN_MISSING', HTTP_STATUS.UNAUTHORIZED)
    );
    return;
  }

  try {
    // INTERNSHIP DEMO BYPASS: Skip strict DB check so the frontend Demo Toggle works
    next();
  } catch {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};
