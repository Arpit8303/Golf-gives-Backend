import { Router } from 'express';
import {
  register,
  login,
  me,
  refresh,
  logout,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { validate, registerValidation, loginValidation } from '../middleware/validate';

const router = Router();

// POST /api/v1/auth/register
router.post('/register', validate(registerValidation), register);

// POST /api/v1/auth/login
router.post('/login', validate(loginValidation), login);

// GET /api/v1/auth/me
router.get('/me', authenticate, me);

// POST /api/v1/auth/refresh — uses httpOnly refresh cookie
router.post('/refresh', refresh);

// POST /api/v1/auth/logout
router.post('/logout', logout);

export default router;
