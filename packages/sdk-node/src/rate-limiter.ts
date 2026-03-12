/**
 * Simple sliding-window rate limiter.
 * Tracks request timestamps per key and prunes expired entries on each check.
 */
export class SlidingWindowRateLimiter {
  private windows: Map<string, number[]> = new Map();

  constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number,
  ) {}

  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const timestamps = (this.windows.get(key) || []).filter((t) => t > cutoff);

    if (timestamps.length >= this.maxRequests) {
      const oldest = timestamps[0]!;
      return { allowed: false, retryAfterMs: oldest + this.windowMs - now };
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);
    return { allowed: true, retryAfterMs: 0 };
  }
}
