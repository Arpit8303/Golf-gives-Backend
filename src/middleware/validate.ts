import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { HTTP_STATUS, buildError } from '../constants/errors';
import { SCORE_MIN, SCORE_MAX, CHARITY_MIN_PERCENTAGE } from '../constants';
import { body, param } from 'express-validator';
import { supabase } from '../config/supabase';

/**
 * Runs express-validator validations and returns 400 if any fail
 */
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await Promise.all(validations.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        ...buildError('VALIDATION_ERROR', HTTP_STATUS.BAD_REQUEST),
        details: errors.array(),
      });
      return;
    }
    next();
  };
};

// --- Reusable validation chains ---

export const registerValidation = [
  body('full_name').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
];

export const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const scoreValidation = [
  body('score')
    .isInt({ min: SCORE_MIN, max: SCORE_MAX })
    .withMessage(`Score must be an integer between ${SCORE_MIN} and ${SCORE_MAX}`),
  body('entry_date')
    .isISO8601()
    .withMessage('Entry date must be a valid ISO 8601 date (YYYY-MM-DD)'),
];

export const scoreUpdateValidation = [
  body('score')
    .optional()
    .isInt({ min: SCORE_MIN, max: SCORE_MAX })
    .withMessage(`Score must be an integer between ${SCORE_MIN} and ${SCORE_MAX}`),
  body('entry_date')
    .optional()
    .isISO8601()
    .withMessage('Entry date must be a valid ISO 8601 date (YYYY-MM-DD)'),
];

export const charityPercentageValidation = [
  body('charity_percentage')
    .optional()
    .isInt({ min: CHARITY_MIN_PERCENTAGE })
    .withMessage(`Charity percentage must be at least ${CHARITY_MIN_PERCENTAGE}%`),
];

export const donationValidation = [
  body('charityId').isUUID().withMessage('Valid charity ID is required'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Donation amount must be greater than 0'),
];

export const uuidParamValidation = [
  param('id').isUUID().withMessage('Valid UUID is required'),
];

/**
 * Checks for duplicate score date at the application layer (belt-and-suspenders
 * alongside the DB UNIQUE constraint on scores(user_id, entry_date)).
 */
export const checkDuplicateScoreDate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { entry_date } = req.body;
  const userId = req.user?.userId;
  const scoreId = req.params.id; // only present on PUT

  if (!entry_date || !userId) {
    next();
    return;
  }

  let query = supabase
    .from('scores')
    .select('id')
    .eq('user_id', userId)
    .eq('entry_date', entry_date);

  // On PUT, exclude current score from the check
  if (scoreId) {
    query = query.neq('id', scoreId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
    return;
  }

  if (data) {
    res.status(HTTP_STATUS.CONFLICT).json(
      buildError('SCORE_DATE_DUPLICATE', HTTP_STATUS.CONFLICT)
    );
    return;
  }

  next();
};
