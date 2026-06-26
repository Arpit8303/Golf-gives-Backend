// Centralised error codes and messages — all errors reference this file

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const ERROR_CODES = {
  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_MISSING: 'TOKEN_MISSING',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',

  // Subscription
  SUBSCRIPTION_INACTIVE: 'SUBSCRIPTION_INACTIVE',
  SUBSCRIPTION_ALREADY_ACTIVE: 'SUBSCRIPTION_ALREADY_ACTIVE',
  SUBSCRIPTION_NOT_FOUND: 'SUBSCRIPTION_NOT_FOUND',

  // Scores
  SCORE_DATE_DUPLICATE: 'SCORE_DATE_DUPLICATE',
  SCORE_OUT_OF_RANGE: 'SCORE_OUT_OF_RANGE',
  SCORE_NOT_FOUND: 'SCORE_NOT_FOUND',
  SCORE_OWNERSHIP_DENIED: 'SCORE_OWNERSHIP_DENIED',

  // Draws
  DRAW_NOT_FOUND: 'DRAW_NOT_FOUND',
  DRAW_ALREADY_PUBLISHED: 'DRAW_ALREADY_PUBLISHED',
  DRAW_NOT_SIMULATED: 'DRAW_NOT_SIMULATED',

  // Charities
  CHARITY_NOT_FOUND: 'CHARITY_NOT_FOUND',

  // Donations
  DONATION_AMOUNT_INVALID: 'DONATION_AMOUNT_INVALID',
  DONATION_ALREADY_PROCESSED: 'DONATION_ALREADY_PROCESSED',

  // Winners / Proof
  PROOF_FILE_TOO_LARGE: 'PROOF_FILE_TOO_LARGE',
  PROOF_FILE_TYPE_INVALID: 'PROOF_FILE_TYPE_INVALID',
  WINNER_NOT_FOUND: 'WINNER_NOT_FOUND',
  WINNER_OWNERSHIP_DENIED: 'WINNER_OWNERSHIP_DENIED',

  // General
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

export const ERROR_MESSAGES: Record<keyof typeof ERROR_CODES, string> = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  TOKEN_EXPIRED: 'Access token has expired',
  TOKEN_INVALID: 'Invalid access token',
  TOKEN_MISSING: 'Authentication token is required',
  REFRESH_TOKEN_INVALID: 'Invalid or expired refresh token',
  EMAIL_ALREADY_EXISTS: 'An account with this email already exists',

  SUBSCRIPTION_INACTIVE: 'An active subscription is required to access this resource',
  SUBSCRIPTION_ALREADY_ACTIVE: 'You already have an active subscription',
  SUBSCRIPTION_NOT_FOUND: 'No subscription found for this user',

  SCORE_DATE_DUPLICATE: 'A score for this date already exists',
  SCORE_OUT_OF_RANGE: 'Score must be between 1 and 45',
  SCORE_NOT_FOUND: 'Score not found',
  SCORE_OWNERSHIP_DENIED: 'You do not have permission to modify this score',

  DRAW_NOT_FOUND: 'Draw not found',
  DRAW_ALREADY_PUBLISHED: 'This draw has already been published',
  DRAW_NOT_SIMULATED: 'Draw must be simulated before publishing',

  CHARITY_NOT_FOUND: 'Charity not found',

  DONATION_AMOUNT_INVALID: 'Donation amount must be greater than 0',
  DONATION_ALREADY_PROCESSED: 'This donation has already been processed',

  PROOF_FILE_TOO_LARGE: 'File must be jpeg, png, or webp under 5MB',
  PROOF_FILE_TYPE_INVALID: 'File must be jpeg, png, or webp under 5MB',
  WINNER_NOT_FOUND: 'Winner record not found',
  WINNER_OWNERSHIP_DENIED: 'You do not have permission to access this winner record',

  VALIDATION_ERROR: 'Validation failed',
  NOT_FOUND: 'Resource not found',
  INTERNAL_ERROR: 'An internal server error occurred',
  FORBIDDEN: 'You do not have permission to perform this action',
  UNAUTHORIZED: 'Authentication is required',
};

// Helper to build a standard error response
export const buildError = (
  code: keyof typeof ERROR_CODES,
  statusCode: number,
  overrideMessage?: string
) => ({
  success: false as const,
  error: overrideMessage ?? ERROR_MESSAGES[code],
  code: ERROR_CODES[code],
  statusCode,
});
