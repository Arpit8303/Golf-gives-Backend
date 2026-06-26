import { stripe } from '../config/stripe';
import { SUBSCRIPTION_PLANS } from '../constants';

type PlanId = 'monthly' | 'yearly';

/**
 * Creates a Stripe Checkout Session for a subscription.
 */
export const createCheckoutSession = async ({
  userId,
  email,
  planId,
  successUrl,
  cancelUrl,
}: {
  userId: string;
  email: string;
  planId: PlanId;
  successUrl: string;
  cancelUrl: string;
}) => {
  const plan = planId === 'monthly' ? SUBSCRIPTION_PLANS.MONTHLY : SUBSCRIPTION_PLANS.YEARLY;

  // Create or retrieve Stripe customer
  const customers = await stripe.customers.list({ email, limit: 1 });
  let customerId: string;

  if (customers.data.length > 0) {
    customerId = customers.data[0].id;
  } else {
    const customer = await stripe.customers.create({ email, metadata: { userId } });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price: plan.stripePriceId,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId, planId },
  });

  return { sessionId: session.id, url: session.url };
};

/**
 * Cancels a Stripe subscription at period end.
 */
export const cancelSubscription = async (stripeSubscriptionId: string) => {
  return stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
};

/**
 * Creates a Stripe PaymentIntent for a one-off donation.
 * Amount is in GBP (pounds). Converted to pence for Stripe.
 */
export const createDonationPaymentIntent = async ({
  amountGBP,
  charityId,
  userId,
}: {
  amountGBP: number;
  charityId: string;
  userId?: string;
}) => {
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(amountGBP * 100), // convert to pence
    currency: 'gbp',
    automatic_payment_methods: { enabled: true },
    metadata: { charityId, userId: userId ?? 'guest' },
  });

  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
};
