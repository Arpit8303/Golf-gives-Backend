import { Router } from 'express';
import {
  getCharities,
  getFeaturedCharity,
  getCharityById,
} from '../controllers/charity.controller';

const router = Router();

// ALL charity routes are PUBLIC (no JWT required — visitors can browse)

// GET /api/v1/charities
router.get('/', getCharities);

// GET /api/v1/charities/featured
router.get('/featured', getFeaturedCharity);

// GET /api/v1/charities/:id
router.get('/:id', getCharityById);

export default router;
