/**
 * Secure Error Handling
 *
 * Sanitizes error messages to prevent information leakage while
 * maintaining useful feedback for users.
 */

export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Map of Appwrite error codes to user-friendly messages
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Authentication errors
  '401': 'Invalid email or password',
  '409': 'An account with this email already exists',
  '429': 'Too many attempts. Please try again later',
  '503': 'Service temporarily unavailable',
  'user_unauthorized': 'Invalid email or password',
  'user_already_exists': 'An account with this email already exists',
  'user_not_found': 'Account not found',
  'user_session_not_found': 'Your session has expired. Please log in again',
  'user_invalid_credentials': 'Invalid email or password',
  'password_mismatch': 'Password is incorrect',

  // General errors
  'general_unknown': 'An unexpected error occurred',
  'general_service_disabled': 'This service is temporarily unavailable',
  'general_rate_limit_exceeded': 'Too many requests. Please slow down',
  'general_access_forbidden': 'Access denied',

  // Document errors
  'document_not_found': 'Resource not found',
  'document_invalid_structure': 'Invalid data format',

  // Storage errors
  'storage_file_not_found': 'File not found',
  'storage_file_too_large': 'File is too large',
  'storage_invalid_file_type': 'Invalid file type',
};

/**
 * Handle authentication errors with sanitized messages
 */
export function handleAuthError(error: any, context: string): never {
  // Log full error for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.error(`[Auth Error - ${context}]:`, error);
  }

  // Send to error tracking service in production
  if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
    // TODO: Integrate with error tracking service (e.g., Sentry)
    // trackError(error, { context, type: 'auth' });
  }

  // Extract error code
  let errorCode: string | undefined;
  let message = ERROR_MESSAGES.general_unknown;

  if (error?.code) {
    errorCode = String(error.code);
  } else if (error?.type) {
    errorCode = error.type;
  }

  if (errorCode) {
    message = ERROR_MESSAGES[errorCode] || message;
  }

  // Check for rate limit in message
  const normalized = error?.message?.toLowerCase();
  if (normalized && normalized.includes('rate limit')) {
    message = ERROR_MESSAGES['429'];
    errorCode = '429';
  }

  throw new AuthError(message, errorCode || 'UNKNOWN_ERROR', error);
}

/**
 * Handle general API errors
 */
export function handleAPIError(error: any, context: string): never {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[API Error - ${context}]:`, error);
  }

  if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
    // TODO: Track error
  }

  let message = 'An error occurred. Please try again';

  let errorCode: string | undefined;
  if (error?.code) {
    errorCode = String(error.code);
  } else if (error?.type) {
    errorCode = error.type;
  }

  if (errorCode) {
    message = ERROR_MESSAGES[errorCode] || message;
  }

  throw new Error(message);
}

/**
 * Format error for display to user
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    return error.message;
  }

  if (error instanceof ValidationError) {
    return error.message;
  }

  if (error instanceof Error) {
    // Check if it's a known error message
    for (const [_, msg] of Object.entries(ERROR_MESSAGES)) {
      if (error.message === msg) {
        return error.message;
      }
    }

    // Generic fallback for unknown errors
    return 'An unexpected error occurred. Please try again';
  }

  return 'An unexpected error occurred';
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: any): boolean {
  return (
    error?.message?.includes('network') ||
    error?.message?.includes('fetch') ||
    error?.code === 'ECONNREFUSED' ||
    error?.code === 'ETIMEDOUT'
  );
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  const retryableCodes = [429, 500, 502, 503, 504];
  return (
    retryableCodes.includes(error?.code) ||
    isNetworkError(error)
  );
}
