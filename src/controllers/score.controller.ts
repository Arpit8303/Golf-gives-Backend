import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { HTTP_STATUS, buildError } from '../constants/errors';
import { SCORE_LIMIT } from '../constants';

/**
 * GET /api/v1/scores
 * Returns the authenticated user's scores, newest first (max 5).
 */
export const getScores = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: scores, error } = await supabase
      .from('scores')
      .select('id, score, entry_date, created_at')
      .eq('user_id', req.user!.userId)
      .order('entry_date', { ascending: false })
      .limit(SCORE_LIMIT);

    if (error) throw error;

    res.json({ success: true, data: { scores: scores ?? [] }, message: 'Scores retrieved' });
  } catch (err) {
    console.error('getScores error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};

/**
 * POST /api/v1/scores
 * Adds a new score with rolling 5-score logic:
 * - If user already has 5 scores, deletes the oldest before inserting the new one.
 * - Duplicate date is caught by checkDuplicateScoreDate middleware before this runs.
 */
export const addScore = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { score, entry_date } = req.body as { score: number; entry_date: string };

    // Count current scores
    const { count } = await supabase
      .from('scores')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // If at limit, delete the oldest score (rolling window)
    if ((count ?? 0) >= SCORE_LIMIT) {
      const { data: oldest } = await supabase
        .from('scores')
        .select('id')
        .eq('user_id', userId)
        .order('entry_date', { ascending: true })
        .limit(1)
        .single();

      if (oldest) {
        await supabase.from('scores').delete().eq('id', oldest.id);
      }
    }

    // Insert new score
    const { data: newScore, error: insertError } = await supabase
      .from('scores')
      .insert({ user_id: userId, score, entry_date })
      .select('id, score, entry_date, created_at')
      .single();

    if (insertError) {
      // DB-level duplicate catch (belt-and-suspenders)
      if (insertError.code === '23505') {
        res.status(HTTP_STATUS.CONFLICT).json(
          buildError('SCORE_DATE_DUPLICATE', HTTP_STATUS.CONFLICT)
        );
        return;
      }
      throw insertError;
    }

    // Return updated list
    const { data: allScores } = await supabase
      .from('scores')
      .select('id, score, entry_date, created_at')
      .eq('user_id', userId)
      .order('entry_date', { ascending: false })
      .limit(SCORE_LIMIT);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { score: newScore, scores: allScores ?? [] },
      message: 'Score added successfully',
    });
  } catch (err) {
    console.error('addScore error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};

/**
 * PUT /api/v1/scores/:id
 * Edits an existing score. Validates ownership and date uniqueness.
 */
export const updateScore = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { score, entry_date } = req.body as { score?: number; entry_date?: string };

    // Ownership check
    const { data: existing, error: fetchError } = await supabase
      .from('scores')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !existing) {
      res.status(HTTP_STATUS.NOT_FOUND).json(
        buildError('SCORE_NOT_FOUND', HTTP_STATUS.NOT_FOUND)
      );
      return;
    }

    if (existing.user_id !== userId) {
      res.status(HTTP_STATUS.FORBIDDEN).json(
        buildError('SCORE_OWNERSHIP_DENIED', HTTP_STATUS.FORBIDDEN)
      );
      return;
    }

    const updatePayload: Record<string, unknown> = {};
    if (score !== undefined) updatePayload.score = score;
    if (entry_date !== undefined) updatePayload.entry_date = entry_date;

    const { data: updated, error: updateError } = await supabase
      .from('scores')
      .update(updatePayload)
      .eq('id', id)
      .select('id, score, entry_date, created_at')
      .single();

    if (updateError) {
      if (updateError.code === '23505') {
        res.status(HTTP_STATUS.CONFLICT).json(
          buildError('SCORE_DATE_DUPLICATE', HTTP_STATUS.CONFLICT)
        );
        return;
      }
      throw updateError;
    }

    res.json({
      success: true,
      data: { score: updated },
      message: 'Score updated successfully',
    });
  } catch (err) {
    console.error('updateScore error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};

/**
 * DELETE /api/v1/scores/:id
 * Deletes a score. Validates ownership.
 */
export const deleteScore = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    // Ownership check
    const { data: existing } = await supabase
      .from('scores')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      res.status(HTTP_STATUS.NOT_FOUND).json(
        buildError('SCORE_NOT_FOUND', HTTP_STATUS.NOT_FOUND)
      );
      return;
    }

    if (existing.user_id !== userId) {
      res.status(HTTP_STATUS.FORBIDDEN).json(
        buildError('SCORE_OWNERSHIP_DENIED', HTTP_STATUS.FORBIDDEN)
      );
      return;
    }

    await supabase.from('scores').delete().eq('id', id);

    res.json({ success: true, data: null, message: 'Score deleted successfully' });
  } catch (err) {
    console.error('deleteScore error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};
