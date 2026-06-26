import { Router } from 'express';
import { getPublishedDraws, getUpcomingDraw, getDrawById } from '../controllers/draw.controller';

const router = Router();

// ALL draw listing routes are PUBLIC (no JWT required)

// GET /api/v1/draws
router.get('/', getPublishedDraws);

// GET /api/v1/draws/upcoming
router.get('/upcoming', getUpcomingDraw);

// GET /api/v1/draws/:id
router.get('/:id', getDrawById);

export default router;
