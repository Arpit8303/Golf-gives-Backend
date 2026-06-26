import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.FROM_EMAIL ?? 'noreply@golfgives.com';

export const EMAIL_TEMPLATES = {
  USER_REGISTERED: 'USER_REGISTERED',
  SUBSCRIPTION_ACTIVATED: 'SUBSCRIPTION_ACTIVATED',
  SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
  SUBSCRIPTION_LAPSED: 'SUBSCRIPTION_LAPSED',
  DRAW_PUBLISHED: 'DRAW_PUBLISHED',
  WINNER_NOTIFIED: 'WINNER_NOTIFIED',
  PROOF_APPROVED: 'PROOF_APPROVED',
  PROOF_REJECTED: 'PROOF_REJECTED',
  PAYOUT_COMPLETE: 'PAYOUT_COMPLETE',
} as const;

type EmailTemplate = keyof typeof EMAIL_TEMPLATES;

interface EmailContext {
  user?: { full_name: string; email: string };
  plan?: string;
  renewalDate?: string;
  drawMonth?: string;
  prizeAmount?: number;
  matchType?: string;
  reason?: string;
  [key: string]: unknown;
}

/**
 * Builds email subject and HTML body for each template.
 */
const buildEmail = (
  template: EmailTemplate,
  ctx: EmailContext
): { subject: string; html: string } => {
  const name = ctx.user?.full_name ?? 'Golfer';

  const templates: Record<EmailTemplate, { subject: string; html: string }> = {
    USER_REGISTERED: {
      subject: '🏌️ Welcome to GolfGives!',
      html: `<h1>Welcome, ${name}!</h1><p>You've joined GolfGives — where every swing can change a life. Subscribe to start entering monthly draws and supporting charities.</p>`,
    },
    SUBSCRIPTION_ACTIVATED: {
      subject: '✅ Subscription Confirmed — GolfGives',
      html: `<h1>You're in, ${name}!</h1><p>Your <strong>${ctx.plan}</strong> subscription is now active. Renewal date: <strong>${ctx.renewalDate}</strong>. Start entering your scores!</p>`,
    },
    SUBSCRIPTION_CANCELLED: {
      subject: '📋 Subscription Cancelled — GolfGives',
      html: `<h1>Subscription Cancelled</h1><p>Hi ${name}, your subscription has been cancelled. You'll retain access until <strong>${ctx.renewalDate}</strong>.</p>`,
    },
    SUBSCRIPTION_LAPSED: {
      subject: '⚠️ Payment Failed — GolfGives',
      html: `<h1>Payment Issue</h1><p>Hi ${name}, we couldn't process your payment. Please update your payment method to keep your GolfGives subscription active.</p>`,
    },
    DRAW_PUBLISHED: {
      subject: `🎰 ${ctx.drawMonth} Draw Results — GolfGives`,
      html: `<h1>The ${ctx.drawMonth} draw is in!</h1><p>Hi ${name}, log in to GolfGives to see the results and check if you've won.</p>`,
    },
    WINNER_NOTIFIED: {
      subject: '🏆 You Won! — GolfGives',
      html: `<h1>Congratulations, ${name}!</h1><p>You matched ${ctx.matchType?.replace('_', ' ')} and won <strong>£${ctx.prizeAmount}</strong> in the ${ctx.drawMonth} draw! Log in to upload your proof of identity.</p>`,
    },
    PROOF_APPROVED: {
      subject: '✅ Proof Approved — GolfGives',
      html: `<h1>Your proof has been approved, ${name}!</h1><p>Your prize of <strong>£${ctx.prizeAmount}</strong> is being processed for payment.</p>`,
    },
    PROOF_REJECTED: {
      subject: '❌ Proof Rejected — GolfGives',
      html: `<h1>Proof Not Accepted</h1><p>Hi ${name}, unfortunately your proof was rejected. Reason: <em>${ctx.reason ?? 'Not specified'}</em>. Please contact support.</p>`,
    },
    PAYOUT_COMPLETE: {
      subject: '💰 Payment Sent — GolfGives',
      html: `<h1>Payment Confirmed!</h1><p>Hi ${name}, your prize of <strong>£${ctx.prizeAmount}</strong> has been sent. Enjoy!</p>`,
    },
  };

  return templates[template];
};

/**
 * Sends an email for the given template and context.
 * Non-blocking — errors are caught and logged, never thrown.
 */
export const sendEmail = async (
  template: EmailTemplate,
  ctx: EmailContext
): Promise<void> => {
  if (!resend) {
    console.warn(`[Email] Resend not configured. Skipping: ${template}`);
    return;
  }

  if (!ctx.user?.email) {
    console.warn(`[Email] No recipient email for template: ${template}`);
    return;
  }

  try {
    const { subject, html } = buildEmail(template, ctx);
    await resend.emails.send({
      from: FROM,
      to: ctx.user.email,
      subject,
      html,
    });
    console.log(`[Email] Sent ${template} to ${ctx.user.email}`);
  } catch (err) {
    console.error(`[Email] Failed to send ${template}:`, err);
  }
};

/**
 * Send the same email to multiple recipients (e.g., draw published to all participants).
 */
export const sendBulkEmail = async (
  template: EmailTemplate,
  recipients: Array<{ user: { full_name: string; email: string }; [key: string]: unknown }>
): Promise<void> => {
  await Promise.allSettled(
    recipients.map((ctx) => sendEmail(template, ctx as EmailContext))
  );
};
