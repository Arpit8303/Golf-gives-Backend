import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';

dotenv.config();

import authRoutes from './routes/auth.routes';
import scoreRoutes from './routes/score.routes';
import drawRoutes from './routes/draw.routes';
import charityRoutes from './routes/charity.routes';
import subscriptionRoutes from './routes/subscription.routes';
import donationRoutes from './routes/donation.routes';
import winnerRoutes from './routes/winner.routes';
import adminRoutes from './routes/admin.routes';

const app = express();

// CORS — allow only the configured client URL
app.use(
  cors({
    origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
    credentials: true, // Required for httpOnly refresh cookie
  })
);

// Cookie parser — required for reading httpOnly refresh cookie
app.use(cookieParser());

/**
 * IMPORTANT: Stripe webhook MUST receive raw body.
 * Register this BEFORE express.json() middleware.
 */
app.use(
  '/api/v1/subscriptions/webhook',
  express.raw({ type: 'application/json' })
);
app.use(
  '/api/v1/donations/webhook',
  express.raw({ type: 'application/json' })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'GolfGives API is running', version: 'v1' });
});

// All routes versioned under /api/v1
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/scores', scoreRoutes);
app.use('/api/v1/draws', drawRoutes);
app.use('/api/v1/charities', charityRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/v1/donations', donationRoutes);
app.use('/api/v1/winners', winnerRoutes);
app.use('/api/v1/admin', adminRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found', statusCode: 404 });
});

const PORT = process.env.PORT ?? 5000;
app.listen(PORT, () => {
  console.log(`🏌️ GolfGives API running on port ${PORT}`);
});

export default app;
