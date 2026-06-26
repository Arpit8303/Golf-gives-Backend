import { Router } from 'express';
import {
  createDonation,
  handleDonationWebhook,
  getMyDonations,
} from '../controllers/donation.controller';
import { authenticate } from '../middleware/auth';
import { validate, donationValidation } from '../middleware/validate';

const router = Router();

// POST /api/v1/donations/create (JWT optional — guests allowed)
router.post('/create', validate(donationValidation), createDonation);

// POST /api/v1/donations/webhook (raw body, no JWT)
router.post('/webhook', handleDonationWebhook);

// GET /api/v1/donations/my-donations (JWT required)
router.get('/my-donations', authenticate, getMyDonations);

export default router;
