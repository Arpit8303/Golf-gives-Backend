import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { HTTP_STATUS, buildError } from '../constants/errors';
import { PAGINATION_DEFAULT_LIMIT } from '../constants';
import { runDraw, checkMatches } from '../services/draw.service';
import {
  calculatePrizePool,
  distributePrizes,
  groupMatchesByTier,
} from '../services/prize.service';
import { sendEmail, sendBulkEmail, EMAIL_TEMPLATES } from '../services/email.service';

// ==================== USERS ====================

export const listUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || PAGINATION_DEFAULT_LIMIT;
    const search = req.query.search as string;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('users')
      .select('id, full_name, email, role, subscription_status, subscription_plan, subscription_renewal_date, charity_percentage, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: users, error, count } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data: { users: users ?? [], total: count ?? 0, page, limit },
      message: 'Users retrieved',
    });
  } catch (err) {
    console.error('listUsers error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { full_name, role, subscription_status, charity_id, charity_percentage } = req.body;

    // Validate charity_percentage if provided
    if (charity_percentage !== undefined && charity_percentage < 10) {
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        buildError('VALIDATION_ERROR', HTTP_STATUS.BAD_REQUEST, 'Charity percentage must be at least 10%')
      );
      return;
    }

    const updatePayload: Record<string, unknown> = {};
    if (full_name) updatePayload.full_name = full_name;
    if (role) updatePayload.role = role;
    if (subscription_status) updatePayload.subscription_status = subscription_status;
    if (charity_id !== undefined) updatePayload.charity_id = charity_id;
    if (charity_percentage !== undefined) updatePayload.charity_percentage = charity_percentage;

    const { data: updated, error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', id)
      .select('id, full_name, email, role, subscription_status, charity_percentage')
      .single();

    if (error) throw error;

    res.json({ success: true, data: { user: updated }, message: 'User updated' });
  } catch (err) {
    console.error('updateUser error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};

// ==================== DRAWS ====================

export const listAllDraws = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data: draws, error } = await supabase
      .from('draws')
      .select('id, draw_month, draw_type, status, drawn_numbers, jackpot_rollover, created_at, prize_pools(*)')
      .order('draw_month', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data: { draws: draws ?? [] }, message: 'All draws retrieved' });
  } catch (err) {
    console.error('listAllDraws error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};

export const createDraw = async (req: Request, res: Response): Promise<void> => {
  try {
    const { draw_month, draw_type } = req.body as { draw_month: string; draw_type: 'random' | 'algorithmic' };

    const { data: draw, error } = await supabase
      .from('draws')
      .insert({ draw_month, draw_type, status: 'draft', drawn_numbers: [], jackpot_rollover: 0 })
      .select()
      .single();

    if (error) throw error;
    res.status(HTTP_STATUS.CREATED).json({ success: true, data: { draw }, message: 'Draw created' });
  } catch (err) {
    console.error('createDraw error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};

export const simulateDraw = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: draw } = await supabase.from('draws').select('*').eq('id', id).single();
    if (!draw) {
      res.status(HTTP_STATUS.NOT_FOUND).json(buildError('DRAW_NOT_FOUND', HTTP_STATUS.NOT_FOUND));
      return;
    }
    if (draw.status === 'published') {
      res.status(HTTP_STATUS.CONFLICT).json(buildError('DRAW_ALREADY_PUBLISHED', HTTP_STATUS.CONFLICT));
      return;
    }

    // Run draw engine (dry run)
    const { numbers } = await runDraw(draw.draw_type);
    const matches = await checkMatches(numbers);

    // Get last draw rollover
    const { data: lastPublished } = await supabase
      .from('draws')
      .select('jackpot_rollover')
      .eq('status', 'published')
      .order('draw_month', { ascending: false })
      .limit(1)
      .maybeSingle();

    const jackpotRollover = lastPublished?.jackpot_rollover ?? 0;

    const { count: activeSubscribers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'active');

    const pools = calculatePrizePool({
      activeSubscriberCount: activeSubscribers ?? 0,
      contributionPerSubscriber: 9.99,
      jackpotRollover,
    });

    const matchGroups = groupMatchesByTier(matches);
    const { winners, newJackpotRollover } = distributePrizes(matchGroups, pools);

    // Save simulated state
    await supabase
      .from('draws')
      .update({ status: 'simulated', drawn_numbers: numbers })
      .eq('id', id);

    res.json({
      success: true,
      data: {
        drawnNumbers: numbers,
        pools,
        winners,
        matchGroups: matchGroups.map((g) => ({ ...g, count: g.userIds.length })),
        newJackpotRollover,
        preview: true,
      },
      message: 'Draw simulated (dry run — not published)',
    });
  } catch (err) {
    console.error('simulateDraw error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};

export const publishDraw = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: draw } = await supabase.from('draws').select('*').eq('id', id).single();
    if (!draw) {
      res.status(HTTP_STATUS.NOT_FOUND).json(buildError('DRAW_NOT_FOUND', HTTP_STATUS.NOT_FOUND));
      return;
    }
    if (draw.status === 'published') {
      res.status(HTTP_STATUS.CONFLICT).json(buildError('DRAW_ALREADY_PUBLISHED', HTTP_STATUS.CONFLICT));
      return;
    }
    if (draw.status !== 'simulated') {
      res.status(HTTP_STATUS.BAD_REQUEST).json(buildError('DRAW_NOT_SIMULATED', HTTP_STATUS.BAD_REQUEST));
      return;
    }

    const numbers: number[] = draw.drawn_numbers;
    const matches = await checkMatches(numbers);

    const { data: lastPublished } = await supabase
      .from('draws')
      .select('jackpot_rollover')
      .eq('status', 'published')
      .order('draw_month', { ascending: false })
      .limit(1)
      .maybeSingle();

    const jackpotRollover = lastPublished?.jackpot_rollover ?? 0;

    const { count: activeSubscribers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'active');

    const pools = calculatePrizePool({
      activeSubscriberCount: activeSubscribers ?? 0,
      contributionPerSubscriber: 9.99,
      jackpotRollover,
    });

    const matchGroups = groupMatchesByTier(matches);
    const { winners, newJackpotRollover } = distributePrizes(matchGroups, pools);

    // Save prize pool
    await supabase.from('prize_pools').insert({
      draw_id: id,
      total_pool: pools.totalPool,
      five_match_pool: pools.fiveMatchPool,
      four_match_pool: pools.fourMatchPool,
      three_match_pool: pools.threeMatchPool,
      jackpot_rollover: newJackpotRollover,
    });

    // Save draw results
    if (winners.length > 0) {
      const resultRows = winners.map((w) => ({
        draw_id: id,
        user_id: w.userId,
        match_type: w.matchType,
        prize_amount: w.prizeAmount,
        payment_status: 'pending',
        verification_status: 'pending',
      }));
      await supabase.from('draw_results').insert(resultRows);
    }

    // Update draw status and rollover
    await supabase
      .from('draws')
      .update({ status: 'published', jackpot_rollover: newJackpotRollover })
      .eq('id', id);

    // Email all active subscribers
    const { data: subscribers } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('subscription_status', 'active');

    if (subscribers && subscribers.length > 0) {
      sendBulkEmail(
        EMAIL_TEMPLATES.DRAW_PUBLISHED,
        subscribers.map((u) => ({ user: u, drawMonth: draw.draw_month }))
      ).catch(console.error);
    }

    // Email winners individually
    for (const winner of winners) {
      const { data: winUser } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', winner.userId)
        .single();

      if (winUser) {
        sendEmail(EMAIL_TEMPLATES.WINNER_NOTIFIED, {
          user: winUser,
          matchType: winner.matchType,
          prizeAmount: winner.prizeAmount,
          drawMonth: draw.draw_month,
        }).catch(console.error);
      }
    }

    res.json({
      success: true,
      data: { draw: { ...draw, status: 'published' }, winners, pools, newJackpotRollover },
      message: `Draw published. ${winners.length} winner(s) notified.`,
    });
  } catch (err) {
    console.error('publishDraw error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};

// ==================== CHARITIES ====================

export const listAllCharities = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data: charities, error } = await supabase
      .from('charities')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: { charities: charities ?? [] }, message: 'Charities retrieved' });
  } catch (err) {
    console.error('listAllCharities error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};

export const createCharity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, image_url, is_featured, events } = req.body;
    const { data: charity, error } = await supabase
      .from('charities')
      .insert({ name, description, image_url, is_featured: is_featured ?? false, events: events ?? [] })
      .select()
      .single();
    if (error) throw error;
    res.status(HTTP_STATUS.CREATED).json({ success: true, data: { charity }, message: 'Charity created' });
  } catch (err) {
    console.error('createCharity error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};

export const updateCharity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, image_url, is_featured, events } = req.body;

    const updatePayload: Record<string, unknown> = {};
    if (name !== undefined) updatePayload.name = name;
    if (description !== undefined) updatePayload.description = description;
    if (image_url !== undefined) updatePayload.image_url = image_url;
    if (is_featured !== undefined) updatePayload.is_featured = is_featured;
    if (events !== undefined) updatePayload.events = events;

    const { data: charity, error } = await supabase
      .from('charities')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data: { charity }, message: 'Charity updated' });
  } catch (err) {
    console.error('updateCharity error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};

export const deleteCharity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('charities').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true, data: null, message: 'Charity deleted' });
  } catch (err) {
    console.error('deleteCharity error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};

// ==================== WINNERS ====================

export const listAllWinners = async (req: Request, res: Response): Promise<void> => {
  try {
    const { verification_status, payment_status } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = PAGINATION_DEFAULT_LIMIT;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('draw_results')
      .select('id, match_type, prize_amount, payment_status, proof_url, verification_status, users(id, full_name, email), draws(id, draw_month)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (verification_status) query = query.eq('verification_status', verification_status);
    if (payment_status) query = query.eq('payment_status', payment_status);

    const { data: winners, error, count } = await query;
    if (error) throw error;

    res.json({ success: true, data: { winners: winners ?? [], total: count ?? 0, page, limit }, message: 'Winners retrieved' });
  } catch (err) {
    console.error('listAllWinners error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};

export const verifyWinner = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body as { status: 'approved' | 'rejected'; reason?: string };

    if (!['approved', 'rejected'].includes(status)) {
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        buildError('VALIDATION_ERROR', HTTP_STATUS.BAD_REQUEST, 'Status must be approved or rejected')
      );
      return;
    }

    const { data: result, error } = await supabase
      .from('draw_results')
      .update({ verification_status: status })
      .eq('id', id)
      .select('id, user_id, prize_amount')
      .single();

    if (error) throw error;

    // Email the winner
    const { data: user } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', result.user_id)
      .single();

    if (user) {
      const template = status === 'approved' ? EMAIL_TEMPLATES.PROOF_APPROVED : EMAIL_TEMPLATES.PROOF_REJECTED;
      sendEmail(template, { user, prizeAmount: result.prize_amount, reason }).catch(console.error);
    }

    res.json({ success: true, data: { result }, message: `Winner proof ${status}` });
  } catch (err) {
    console.error('verifyWinner error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};

export const markWinnerPaid = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: result, error } = await supabase
      .from('draw_results')
      .update({ payment_status: 'paid' })
      .eq('id', id)
      .select('id, user_id, prize_amount')
      .single();

    if (error) throw error;

    const { data: user } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', result.user_id)
      .single();

    if (user) {
      sendEmail(EMAIL_TEMPLATES.PAYOUT_COMPLETE, { user, prizeAmount: result.prize_amount }).catch(console.error);
    }

    res.json({ success: true, data: { result }, message: 'Winner marked as paid' });
  } catch (err) {
    console.error('markWinnerPaid error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};

// ==================== REPORTS ====================

export const getReports = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [subscriberResult, totalUsersResult, prizePoolResult, donationResult] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('subscription_status', 'active'),
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('prize_pools').select('total_pool'),
      supabase.from('donations').select('amount').eq('status', 'completed'),
    ]);

    const totalDonated = (donationResult.data ?? []).reduce((sum, d) => sum + (d.amount as number), 0);
    const totalPrizePool = (prizePoolResult.data ?? []).reduce((sum, d) => sum + (d.total_pool as number), 0);

    res.json({
      success: true,
      data: {
        totalUsers: totalUsersResult.count ?? 0,
        activeSubscribers: subscriberResult.count ?? 0,
        totalPrizePool: totalPrizePool,
        totalDonated: parseFloat(totalDonated.toFixed(2)),
      },
      message: 'Reports retrieved',
    });
  } catch (err) {
    console.error('getReports error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
};
