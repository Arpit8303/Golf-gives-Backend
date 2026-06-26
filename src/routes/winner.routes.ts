import { Router } from 'express';
import { getMyWins, uploadProof } from '../controllers/winner.controller';
import { authenticate } from '../middleware/auth';
import multer from 'multer';

const router = Router();

// Memory storage for multer (file handled in-memory before Supabase upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }, // 6MB limit here (service validates 5MB)
});

// All winner routes require authentication
router.use(authenticate);

// GET /api/v1/winners/my-wins
router.get('/my-wins', getMyWins);

// POST /api/v1/winners/upload-proof
router.post('/upload-proof', upload.single('proof'), uploadProof);

export default router;
