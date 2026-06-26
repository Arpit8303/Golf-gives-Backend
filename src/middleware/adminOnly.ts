import { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, buildError } from '../constants/errors';

/**
 * Admin Role Guard Middleware
 * Must be used AFTER authenticate middleware.
 * Returns 403 if user role is not 'admin'.
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'admin') {
    res.status(HTTP_STATUS.FORBIDDEN).json(
      buildError('FORBIDDEN', HTTP_STATUS.FORBIDDEN)
    );
    return;
  }
  next();
};
