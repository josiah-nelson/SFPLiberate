/**
 * Client-Side Rate Limiter
 *
 * Provides protection against brute-force attacks and abuse by limiting
 * the number of requests within a time window.
 */

interface RateLimitRecord {
  count: number;
  resetAt: Date;
  lockedUntil?: Date;
}

export class RateLimiter {
  private attempts = new Map<string, RateLimitRecord>();

  /**
   * Check if an action is allowed under rate limits
   *
   * @param key - Unique identifier for the action (e.g., email address)
   * @param limit - Maximum number of attempts allowed
   * @param windowMs - Time window in milliseconds
   * @param lockoutMs - Optional lockout duration after exceeding limit
   * @returns true if action is allowed, false if rate limited
   */
  check(
    key: string,
    limit: number,
    windowMs: number,
    lockoutMs?: number
  ): { allowed: boolean; retryAfter?: number } {
    const now = new Date();
    const record = this.attempts.get(key);

    // Check if currently locked out
    if (record?.lockedUntil && record.lockedUntil > now) {
      const retryAfter = Math.ceil((record.lockedUntil.getTime() - now.getTime()) / 1000);
      return { allowed: false, retryAfter };
    }

    // Check if within rate limit window
    if (record && record.resetAt > now) {
      if (record.count >= limit) {
        // Exceeded limit - apply lockout if specified
        if (lockoutMs) {
          record.lockedUntil = new Date(now.getTime() + lockoutMs);
          const retryAfter = Math.ceil(lockoutMs / 1000);
          return { allowed: false, retryAfter };
        }

        const retryAfter = Math.ceil((record.resetAt.getTime() - now.getTime()) / 1000);
        return { allowed: false, retryAfter };
      }

      // Within limit - increment counter
      record.count++;
      return { allowed: true };
    }

    // Create new window
    this.attempts.set(key, {
      count: 1,
      resetAt: new Date(now.getTime() + windowMs)
    });

    return { allowed: true };
  }

  /**
   * Reset rate limit for a specific key
   * Useful for clearing limits after successful authentication
   */
  reset(key: string): void {
    this.attempts.delete(key);
  }

  /**
   * Get current attempt count for a key
   */
  getAttempts(key: string): number {
    const record = this.attempts.get(key);
    return record?.count || 0;
  }

  /**
   * Clean up expired records (call periodically)
   */
  cleanup(): void {
    const now = new Date();
    for (const [key, record] of this.attempts.entries()) {
      if (record.resetAt < now && (!record.lockedUntil || record.lockedUntil < now)) {
        this.attempts.delete(key);
      }
    }
  }
}

// Singleton instances for different rate limit types
export const loginLimiter = new RateLimiter();
export const signupLimiter = new RateLimiter();
export const apiLimiter = new RateLimiter();

// Cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    loginLimiter.cleanup();
    signupLimiter.cleanup();
    apiLimiter.cleanup();
  }, 5 * 60 * 1000);
}
