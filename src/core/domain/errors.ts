/**
 * Typed application errors carrying a stable machine code and HTTP status.
 * The API layer maps these to the standard error envelope. Auth-related
 * messages are deliberately generic to avoid user enumeration (SEC-7).
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (message = 'Invalid request.') => new AppError('VALIDATION_ERROR', message, 400),
  invalidCredentials: () =>
    new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401),
  unauthenticated: () => new AppError('UNAUTHENTICATED', 'Authentication required.', 401),
  forbidden: (message = 'You do not have permission to perform this action.') =>
    new AppError('FORBIDDEN', message, 403),
  invalidToken: () => new AppError('INVALID_TOKEN', 'The token is invalid or has expired.', 401),
  weakPassword: (message: string) => new AppError('WEAK_PASSWORD', message, 400),
  accountDisabled: () => new AppError('ACCOUNT_DISABLED', 'This account is disabled.', 403),
  emailNotVerified: () =>
    new AppError('EMAIL_NOT_VERIFIED', 'Please verify your email address before logging in.', 403),
  notFound: (message = 'Resource not found.') => new AppError('NOT_FOUND', message, 404),
  conflict: (message = 'Resource already exists.') => new AppError('CONFLICT', message, 409),
  tooManyAttempts: () =>
    new AppError(
      'TOO_MANY_ATTEMPTS',
      'Too many failed attempts. Please wait and try again later.',
      429,
    ),
  csrf: () => new AppError('CSRF_REJECTED', 'Cross-origin request rejected.', 403),
} as const;
