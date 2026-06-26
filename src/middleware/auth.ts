import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { HTTP_STATUS, buildError, ERROR_CODES } from '../constants/errors';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * JWT Authentication Middleware
 * Extracts Bearer token from Authorization header,
 * verifies it, and attaches decoded payload to req.user
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json(
      buildError('TOKEN_MISSING', HTTP_STATUS.UNAUTHORIZED)
    );
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    const isExpired = err instanceof Error && err.name === 'TokenExpiredError';
    res.status(HTTP_STATUS.UNAUTHORIZED).json(
      buildError(
        isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        HTTP_STATUS.UNAUTHORIZED
      )
    );
  }
};
