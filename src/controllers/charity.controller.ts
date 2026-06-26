import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { HTTP_STATUS, buildError } from '../constants/errors';

/**
 * GET /api/v1/charities
 * Returns all charities. Supports search by name and filter by featured.
 */
export const getCharities = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, featured } = req.query;

    let query = supabase
      .from('charities')
      .select('id, name, description, image_url, is_featured, events, created_at')
      .order('created_at', { ascending: false });

    if (search && typeof search === 'string') {
      query = query.ilike('name', `%${search}%`);
    }

    if (featured === 'true') {
      query = query.eq('is_featured', true);
    }

    const { data: charities, error } = await query;
    if (error) throw error;

    res.json({ success: true, data: { charities: charities ?? [] }, message: 'Charities retrieved' });
  } catch (err) {
    console.error('getCharities error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};

/**
 * GET /api/v1/charities/featured
 */
export const getFeaturedCharity = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data: charity, error } = await supabase
      .from('charities')
      .select('id, name, description, image_url, is_featured, events, created_at')
      .eq('is_featured', true)
      .maybeSingle();

    if (error) throw error;

    res.json({ success: true, data: { charity }, message: 'Featured charity retrieved' });
  } catch (err) {
    console.error('getFeaturedCharity error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};

/**
 * GET /api/v1/charities/:id
 * Returns a single charity including its JSONB events array.
 */
export const getCharityById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: charity, error } = await supabase
      .from('charities')
      .select('id, name, description, image_url, is_featured, events, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    if (!charity) {
      res.status(HTTP_STATUS.NOT_FOUND).json(
        buildError('CHARITY_NOT_FOUND', HTTP_STATUS.NOT_FOUND)
      );
      return;
    }

    res.json({ success: true, data: { charity }, message: 'Charity retrieved' });
  } catch (err) {
    console.error('getCharityById error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};
