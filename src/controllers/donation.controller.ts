import { Request, Response } from 'express';
import Stripe from 'stripe';
import { stripe } from '../config/stripe';
import { supabase } from '../config/supabase';
import { HTTP_STATUS, buildError } from '../constants/errors';
import { createDonationPaymentIntent } from '../services/stripe.service';

/**
 * POST /api/v1/donations/create
 * Creates a Stripe PaymentIntent for a one-off donation.
 * Guest donations allowed (no JWT required).
 */
export const createDonation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { charityId, amount, userId: bodyUserId } = req.body as {
      charityId: string;
      amount: number;
      userId?: string;
    };

    // Use authenticated user ID if available, otherwise guest
    const userId = req.user?.userId ?? bodyUserId ?? undefined;

    // Verify charity exists
    const { data: charity } = await supabase
      .from('charities')
      .select('id, name')
      .eq('id', charityId)
      .maybeSingle();

    if (!charity) {
      res.status(HTTP_STATUS.NOT_FOUND).json(buildError('CHARITY_NOT_FOUND', HTTP_STATUS.NOT_FOUND));
      return;
    }

    const { clientSecret, paymentIntentId } = await createDonationPaymentIntent({
      amountGBP: amount,
      charityId,
      userId,
    });

    // Create pending donation record
    await supabase.from('donations').insert({
      user_id: userId ?? null,
      charity_id: charityId,
      amount,
      stripe_payment_intent_id: paymentIntentId,
      status: 'pending',
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { clientSecret, paymentIntentId },
      message: 'Payment intent created',
    });
  } catch (err) {
    console.error('createDonation error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};

/**
 * POST /api/v1/donations/webhook
 * Confirms donation payment via Stripe webhook.
 * Idempotency: check stripe_payment_intent_id before processing.
 */
export const handleDonationWebhook = async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch {
    res.status(400).json({ success: false, error: 'Invalid webhook signature' });
    return;
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;

    // Idempotency check
    const { data: existing } = await supabase
      .from('donations')
      .select('id, status')
      .eq('stripe_payment_intent_id', intent.id)
      .maybeSingle();

    if (existing && existing.status === 'completed') {
      // Already processed — return 200 to acknowledge
      res.json({ received: true });
      return;
    }

    if (existing) {
      await supabase
        .from('donations')
        .update({ status: 'completed' })
        .eq('stripe_payment_intent_id', intent.id);
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent;
    await supabase
      .from('donations')
      .update({ status: 'failed' })
      .eq('stripe_payment_intent_id', intent.id);
  }

  res.json({ received: true });
};

/**
 * GET /api/v1/donations/my-donations
 */
export const getMyDonations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: donations, error } = await supabase
      .from('donations')
      .select('id, amount, status, created_at, charities(id, name, image_url)')
      .eq('user_id', req.user!.userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: { donations: donations ?? [] }, message: 'Donations retrieved' });
  } catch (err) {
    console.error('getMyDonations error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};
