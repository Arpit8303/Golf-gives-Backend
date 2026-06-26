import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { HTTP_STATUS, buildError } from '../constants/errors';
import { uploadWinnerProof } from '../services/storage.service';
import { sendEmail, EMAIL_TEMPLATES } from '../services/email.service';

/**
 * GET /api/v1/winners/my-wins
 * Returns all draw results for the authenticated user.
 */
export const getMyWins = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: wins, error } = await supabase
      .from('draw_results')
      .select(`
        id, match_type, prize_amount, payment_status, proof_url, verification_status,
        draws(id, draw_month)
      `)
      .eq('user_id', req.user!.userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const totalWon = (wins ?? []).reduce((sum, w) => {
      return w.payment_status === 'paid' ? sum + (w.prize_amount as number) : sum;
    }, 0);

    res.json({
      success: true,
      data: { wins: wins ?? [], totalWon: parseFloat(totalWon.toFixed(2)) },
      message: 'Wins retrieved',
    });
  } catch (err) {
    console.error('getMyWins error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};

/**
 * POST /api/v1/winners/upload-proof
 * Accepts multipart/form-data with a proof image.
 * Validates ownership of the win, uploads to Supabase Storage.
 */
export const uploadProof = async (req: Request, res: Response): Promise<void> => {
  try {
    const { drawResultId } = req.body as { drawResultId: string };
    const userId = req.user!.userId;

    if (!req.file) {
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        buildError('PROOF_FILE_TYPE_INVALID', HTTP_STATUS.BAD_REQUEST, 'No file uploaded')
      );
      return;
    }

    // Ownership check
    const { data: winRecord } = await supabase
      .from('draw_results')
      .select('id, user_id, draw_id, verification_status')
      .eq('id', drawResultId)
      .maybeSingle();

    if (!winRecord) {
      res.status(HTTP_STATUS.NOT_FOUND).json(buildError('WINNER_NOT_FOUND', HTTP_STATUS.NOT_FOUND));
      return;
    }

    if (winRecord.user_id !== userId) {
      res.status(HTTP_STATUS.FORBIDDEN).json(
        buildError('WINNER_OWNERSHIP_DENIED', HTTP_STATUS.FORBIDDEN)
      );
      return;
    }

    const { publicUrl } = await uploadWinnerProof({
      drawId: winRecord.draw_id,
      userId,
      file: req.file,
    });

    await supabase
      .from('draw_results')
      .update({ proof_url: publicUrl, verification_status: 'pending' })
      .eq('id', drawResultId);

    res.json({
      success: true,
      data: { proofUrl: publicUrl },
      message: 'Proof uploaded successfully. Pending admin verification.',
    });
  } catch (err) {
    console.error('uploadProof error:', err);
    // Handle typed errors from storage service
    if (err && typeof err === 'object' && 'statusCode' in err) {
      res.status((err as { statusCode: number }).statusCode).json(err);
      return;
    }
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};
