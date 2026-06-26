import { Router } from 'express';
import { getScores, addScore, updateScore, deleteScore } from '../controllers/score.controller';
import { authenticate } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscriptionCheck';
import {
  validate,
  scoreValidation,
  scoreUpdateValidation,
  uuidParamValidation,
  checkDuplicateScoreDate,
} from '../middleware/validate';

const router = Router();

// All score routes require active subscription
router.use(authenticate, requireActiveSubscription);

// GET /api/v1/scores — get user's scores (newest first, max 5)
router.get('/', getScores);

// POST /api/v1/scores — add new score (with rolling + dupe date guard)
router.post(
  '/',
  validate(scoreValidation),
  checkDuplicateScoreDate,
  addScore
);

// PUT /api/v1/scores/:id — edit score
router.put(
  '/:id',
  validate([...uuidParamValidation, ...scoreUpdateValidation]),
  checkDuplicateScoreDate,
  updateScore
);

// DELETE /api/v1/scores/:id — delete score
router.delete('/:id', validate(uuidParamValidation), deleteScore);

export default router;
