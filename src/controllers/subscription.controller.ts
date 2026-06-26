import { Request, Response } from 'express';
import Stripe from 'stripe';
import { stripe } from '../config/stripe';
import { supabase } from '../config/supabase';
import { HTTP_STATUS, buildError } from '../constants/errors';
import {
  createCheckoutSession as stripeCreateCheckout,
  cancelSubscription as stripeCancelSubscription,
} from '../services/stripe.service';
import { sendEmail, EMAIL_TEMPLATES } from '../services/email.service';

/**
 * POST /api/v1/subscriptions/create
 * Creates a Stripe Checkout Session and returns the redirect URL.
 */
export const createCheckoutSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { planId } = req.body as { planId: 'monthly' | 'yearly' };

    if (!planId || !['monthly', 'yearly'].includes(planId)) {
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        buildError('VALIDATION_ERROR', HTTP_STATUS.BAD_REQUEST, 'planId must be monthly or yearly')
      );
      return;
    }

    // Fetch user email
    const { data: user } = await supabase
      .from('users')
      .select('email, subscription_status')
      .eq('id', req.user!.userId)
      .single();

    if (!user) {
      res.status(HTTP_STATUS.NOT_FOUND).json(buildError('NOT_FOUND', HTTP_STATUS.NOT_FOUND));
      return;
    }

    const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';

    const { sessionId, url } = await stripeCreateCheckout({
      userId: req.user!.userId,
      email: user.email,
      planId,
      successUrl: `${clientUrl}/dashboard?subscription=success`,
      cancelUrl: `${clientUrl}/subscribe?cancelled=true`,
    });

    res.json({
      success: true,
      data: { sessionId, url },
      message: 'Checkout session created',
    });
  } catch (err) {
    console.error('createCheckoutSession error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};

/**
 * POST /api/v1/subscriptions/webhook
 * Handles Stripe lifecycle events.
 * Raw body required (set in index.ts).
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    res.status(400).json({ success: false, error: 'Invalid webhook signature' });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const planId = session.metadata?.planId as 'monthly' | 'yearly';

        if (!userId) break;

        // Retrieve subscription to get period end
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        const renewalDate = new Date(
          (subscription as unknown as { current_period_end: number }).current_period_end * 1000
        ).toISOString();

        await supabase
          .from('users')
          .update({
            subscription_status: 'active',
            subscription_plan: planId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            subscription_renewal_date: renewalDate,
          })
          .eq('id', userId);

        // Send confirmation email
        const { data: user } = await supabase
          .from('users')
          .select('full_name, email')
          .eq('id', userId)
          .single();

        if (user) {
          sendEmail(EMAIL_TEMPLATES.SUBSCRIPTION_ACTIVATED, {
            user,
            plan: planId,
            renewalDate,
          }).catch(console.error);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Update renewal date from subscription
        const subId = (invoice as unknown as { subscription: string }).subscription;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          const renewalDate = new Date(
            (sub as unknown as { current_period_end: number }).current_period_end * 1000
          ).toISOString();

          await supabase
            .from('users')
            .update({ subscription_renewal_date: renewalDate, subscription_status: 'active' })
            .eq('stripe_customer_id', customerId);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await supabase
          .from('users')
          .update({ subscription_status: 'cancelled' })
          .eq('stripe_customer_id', customerId);

        // Notify user
        const { data: user } = await supabase
          .from('users')
          .select('full_name, email, subscription_renewal_date')
          .eq('stripe_customer_id', customerId)
          .single();

        if (user) {
          sendEmail(EMAIL_TEMPLATES.SUBSCRIPTION_CANCELLED, {
            user,
            renewalDate: user.subscription_renewal_date,
          }).catch(console.error);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await supabase
          .from('users')
          .update({ subscription_status: 'lapsed' })
          .eq('stripe_customer_id', customerId);

        const { data: user } = await supabase
          .from('users')
          .select('full_name, email')
          .eq('stripe_customer_id', customerId)
          .single();

        if (user) {
          sendEmail(EMAIL_TEMPLATES.SUBSCRIPTION_LAPSED, { user }).catch(console.error);
        }
        break;
      }

      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
};

/**
 * GET /api/v1/subscriptions/status
 */
export const getSubscriptionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('subscription_status, subscription_plan, subscription_renewal_date, stripe_subscription_id')
      .eq('id', req.user!.userId)
      .single();

    if (!user) {
      res.status(HTTP_STATUS.NOT_FOUND).json(buildError('NOT_FOUND', HTTP_STATUS.NOT_FOUND));
      return;
    }

    res.json({
      success: true,
      data: {
        status: user.subscription_status,
        plan: user.subscription_plan,
        renewalDate: user.subscription_renewal_date,
        isActive: user.subscription_status === 'active',
      },
      message: 'Subscription status retrieved',
    });
  } catch (err) {
    console.error('getSubscriptionStatus error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};

/**
 * POST /api/v1/subscriptions/cancel
 */
export const cancelSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('stripe_subscription_id, subscription_status, full_name, email, subscription_renewal_date')
      .eq('id', req.user!.userId)
      .single();

    if (!user || !user.stripe_subscription_id) {
      res.status(HTTP_STATUS.NOT_FOUND).json(
        buildError('SUBSCRIPTION_NOT_FOUND', HTTP_STATUS.NOT_FOUND)
      );
      return;
    }

    if (user.subscription_status !== 'active') {
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        buildError('SUBSCRIPTION_NOT_FOUND', HTTP_STATUS.BAD_REQUEST, 'No active subscription to cancel')
      );
      return;
    }

    // Cancel at period end (user retains access until renewal_date)
    await stripeCancelSubscription(user.stripe_subscription_id);

    sendEmail(EMAIL_TEMPLATES.SUBSCRIPTION_CANCELLED, {
      user: { full_name: user.full_name, email: user.email },
      renewalDate: user.subscription_renewal_date,
    }).catch(console.error);

    res.json({
      success: true,
      data: { cancelAtPeriodEnd: true, accessUntil: user.subscription_renewal_date },
      message: 'Subscription will be cancelled at the end of the current period',
    });
  } catch (err) {
    console.error('cancelSubscription error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      buildError('INTERNAL_ERROR', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    );
  }
};
