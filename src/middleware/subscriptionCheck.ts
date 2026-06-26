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
    const { data: user, error } = await supabase
      .from('users')
      .select('subscription_status')
      .eq('id', req.user.userId)
      .single();

    if (error || !user) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        buildError('TOKEN_INVALID', HTTP_STATUS.UNAUTHORIZED)
      );
      return;
    }

    if (user.subscription_status !== 'active') {
      res.status(HTTP_STATUS.FORBIDDEN).json(
        buildError('SUBSCRIPTION_INACTIVE', HTTP_STATUS.FORBIDDEN)
      );
      return;
    }

    next();
  } catch {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};
