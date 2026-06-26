import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { supabase } from '../config/supabase';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt';
import { HTTP_STATUS, buildError } from '../constants/errors';
import { sendEmail, EMAIL_TEMPLATES } from '../services/email.service';

const BCRYPT_ROUNDS = 12;
const REFRESH_COOKIE_NAME = 'gg_refresh';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

/**
 * POST /api/v1/auth/register
 * Creates a new user account, hashes password, returns access token.
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { full_name, email, password } = req.body;

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      res.status(HTTP_STATUS.CONFLICT).json(
        buildError('EMAIL_ALREADY_EXISTS', HTTP_STATUS.CONFLICT)
      );
      return;
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { data: newUser, error } = await supabase
      .from('users')
      .insert({ full_name, email, password_hash, role: 'subscriber', subscription_status: 'inactive' })
      .select('id, full_name, email, role, subscription_status, charity_percentage, created_at')
      .single();

    if (error || !newUser) {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
      );
      return;
    }

    const tokenPayload = { userId: newUser.id, email: newUser.email, role: newUser.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Send welcome email (non-blocking)
    sendEmail(EMAIL_TEMPLATES.USER_REGISTERED, { user: newUser }).catch(console.error);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { accessToken, user: newUser },
      message: 'Account created successfully',
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};

/**
 * POST /api/v1/auth/login
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, full_name, email, password_hash, role, subscription_status, subscription_plan, subscription_renewal_date, charity_id, charity_percentage')
      .eq('email', email)
      .maybeSingle();

    if (error || !user) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        buildError('INVALID_CREDENTIALS', HTTP_STATUS.UNAUTHORIZED)
      );
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        buildError('INVALID_CREDENTIALS', HTTP_STATUS.UNAUTHORIZED)
      );
      return;
    }

    const tokenPayload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    const { password_hash: _, ...safeUser } = user;

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { accessToken, user: safeUser },
      message: 'Login successful',
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};

/**
 * GET /api/v1/auth/me
 * Returns the current authenticated user's profile.
 */
export const me = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, subscription_status, subscription_plan, subscription_renewal_date, charity_id, charity_percentage, created_at')
      .eq('id', req.user!.userId)
      .single();

    if (error || !user) {
      res.status(HTTP_STATUS.NOT_FOUND).json(
        buildError('NOT_FOUND', HTTP_STATUS.NOT_FOUND)
      );
      return;
    }

    res.json({ success: true, data: { user }, message: 'User profile retrieved' });
  } catch (err) {
    console.error('Me error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};

/**
 * POST /api/v1/auth/refresh
 * Validates the httpOnly refresh cookie and issues a new access token.
 */
export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!token) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        buildError('REFRESH_TOKEN_INVALID', HTTP_STATUS.UNAUTHORIZED)
      );
      return;
    }

    const decoded = verifyRefreshToken(token);

    // Verify user still exists and get latest data
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, role, subscription_status')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      res.clearCookie(REFRESH_COOKIE_NAME);
      res.status(HTTP_STATUS.UNAUTHORIZED).json(
        buildError('REFRESH_TOKEN_INVALID', HTTP_STATUS.UNAUTHORIZED)
      );
      return;
    }

    const tokenPayload = { userId: user.id, email: user.email, role: user.role };
    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, REFRESH_COOKIE_OPTIONS);
    res.json({
      success: true,
      data: { accessToken: newAccessToken },
      message: 'Token refreshed',
    });
  } catch {
    res.clearCookie(REFRESH_COOKIE_NAME);
    res.status(HTTP_STATUS.UNAUTHORIZED).json(
      buildError('REFRESH_TOKEN_INVALID', HTTP_STATUS.UNAUTHORIZED)
    );
  }
};

/**
 * POST /api/v1/auth/logout
 * Clears the refresh cookie.
 */
export const logout = (_req: Request, res: Response): void => {
  res.clearCookie(REFRESH_COOKIE_NAME);
  res.json({ success: true, data: null, message: 'Logged out successfully' });
};
