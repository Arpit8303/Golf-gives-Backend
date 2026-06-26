// All business logic constants — never hardcode these elsewhere

export const SCORE_LIMIT = 5;
export const SCORE_MIN = 1;
export const SCORE_MAX = 45;

export const PRIZE_SPLITS = {
  FIVE_MATCH: 0.40,
  FOUR_MATCH: 0.35,
  THREE_MATCH: 0.25,
} as const;

export const CHARITY_MIN_PERCENTAGE = 10;

export const SUBSCRIPTION_PLANS = {
  MONTHLY: {
    id: 'monthly' as const,
    stripePriceId: process.env.STRIPE_PRICE_MONTHLY!,
    label: 'Monthly',
    interval: 'month' as const,
    amountGBP: 999, // pence
  },
  YEARLY: {
    id: 'yearly' as const,
    stripePriceId: process.env.STRIPE_PRICE_YEARLY!,
    label: 'Yearly',
    interval: 'year' as const,
    amountGBP: 9999, // pence
    discountNote: 'Save ~17% vs monthly',
  },
} as const;

export const STORAGE_BUCKET = 'winner-proofs';
export const STORAGE_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
export const STORAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;

export const SUBSCRIPTION_STATUSES = ['active', 'inactive', 'cancelled', 'lapsed'] as const;
export const USER_ROLES = ['subscriber', 'admin'] as const;
export const DRAW_TYPES = ['random', 'algorithmic'] as const;
export const DRAW_STATUSES = ['draft', 'simulated', 'published'] as const;
export const MATCH_TYPES = ['five_match', 'four_match', 'three_match'] as const;
export const VERIFICATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const PAYMENT_STATUSES = ['pending', 'paid'] as const;

export const API_VERSION = '/api/v1';
