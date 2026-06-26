import { Router } from 'express';
import {
  createCheckoutSession,
  handleWebhook,
  getSubscriptionStatus,
  cancelSubscription,
} from '../controllers/subscription.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// POST /api/v1/subscriptions/create (JWT required)
router.post('/create', authenticate, createCheckoutSession);

// POST /api/v1/subscriptions/webhook (raw body — no JWT)
// Raw body parsing is handled in index.ts BEFORE express.json()
router.post('/webhook', handleWebhook);

// GET /api/v1/subscriptions/status (JWT required)
router.get('/status', authenticate, getSubscriptionStatus);

// POST /api/v1/subscriptions/cancel (JWT required)
router.post('/cancel', authenticate, cancelSubscription);

export default router;
