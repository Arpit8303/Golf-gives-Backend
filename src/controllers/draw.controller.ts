import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { HTTP_STATUS, buildError } from '../constants/errors';

/**
 * GET /api/v1/draws
 * Returns all published draws, newest first.
 */
export const getPublishedDraws = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data: draws, error } = await supabase
      .from('draws')
      .select(`
        id, draw_month, draw_type, status, drawn_numbers, jackpot_rollover, created_at,
        prize_pools (id, total_pool, five_match_pool, four_match_pool, three_match_pool, jackpot_rollover)
      `)
      .eq('status', 'published')
      .order('draw_month', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: { draws: draws ?? [] }, message: 'Published draws retrieved' });
  } catch (err) {
    console.error('getPublishedDraws error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};

/**
 * GET /api/v1/draws/upcoming
 * Returns info about the next scheduled draw (next calendar month).
 * Includes current prize pool estimate and any active jackpot rollover.
 */
export const getUpcomingDraw = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Get the most recent draw to check for rollover
    const { data: lastDraw } = await supabase
      .from('draws')
      .select('jackpot_rollover, draw_month')
      .eq('status', 'published')
      .order('draw_month', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Count active subscribers for pool estimate
    const { count: activeSubscribers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'active');

    // Next draw month = first day of next month
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const rollover = lastDraw?.jackpot_rollover ?? 0;
    const estimatedPool = (activeSubscribers ?? 0) * 9.99 + rollover; // Placeholder pricing

    res.json({
      success: true,
      data: {
        nextDrawMonth: nextMonth.toISOString().split('T')[0],
        activeSubscribers: activeSubscribers ?? 0,
        estimatedPool: parseFloat(estimatedPool.toFixed(2)),
        jackpotRollover: parseFloat((rollover as number).toFixed(2)),
        hasRollover: rollover > 0,
      },
      message: 'Upcoming draw info retrieved',
    });
  } catch (err) {
    console.error('getUpcomingDraw error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};

/**
 * GET /api/v1/draws/:id
 * Returns a single draw with its prize pool and results.
 */
export const getDrawById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: draw, error } = await supabase
      .from('draws')
      .select(`
        id, draw_month, draw_type, status, drawn_numbers, jackpot_rollover, created_at,
        prize_pools (id, total_pool, five_match_pool, four_match_pool, three_match_pool, jackpot_rollover),
        draw_results (id, match_type, prize_amount, payment_status, verification_status,
          users (id, full_name)
        )
      `)
      .eq('id', id)
      .eq('status', 'published')
      .maybeSingle();

    if (error) throw error;

    if (!draw) {
      res.status(HTTP_STATUS.NOT_FOUND).json(
        buildError('DRAW_NOT_FOUND', HTTP_STATUS.NOT_FOUND)
      );
      return;
    }

    res.json({ success: true, data: { draw }, message: 'Draw retrieved' });
  } catch (err) {
    console.error('getDrawById error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};
