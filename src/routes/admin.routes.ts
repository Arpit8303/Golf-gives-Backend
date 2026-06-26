import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminOnly';
import {
  listUsers,
  updateUser,
  listAllDraws,
  createDraw,
  simulateDraw,
  publishDraw,
  listAllCharities,
  createCharity,
  updateCharity,
  deleteCharity,
  listAllWinners,
  verifyWinner,
  markWinnerPaid,
  getReports,
} from '../controllers/admin.controller';

const router = Router();

// All admin routes require JWT + admin role
router.use(authenticate, requireAdmin);

// Users
router.get('/users', listUsers);
router.put('/users/:id', updateUser);

// Draws
router.get('/draws', listAllDraws);
router.post('/draws', createDraw);
router.post('/draws/:id/simulate', simulateDraw);
router.post('/draws/:id/publish', publishDraw);

// Charities
router.get('/charities', listAllCharities);
router.post('/charities', createCharity);
router.put('/charities/:id', updateCharity);
router.delete('/charities/:id', deleteCharity);

// Winners
router.get('/winners', listAllWinners);
router.put('/winners/:id/verify', verifyWinner);
router.put('/winners/:id/payout', markWinnerPaid);

// Reports
router.get('/reports', getReports);

export default router;
