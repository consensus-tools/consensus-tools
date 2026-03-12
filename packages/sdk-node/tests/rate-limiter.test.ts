import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SlidingWindowRateLimiter } from "../src/rate-limiter.js";

describe("SlidingWindowRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    const limiter = new SlidingWindowRateLimiter(1000, 3);

    const r1 = limiter.check("user-1");
    const r2 = limiter.check("user-1");
    const r3 = limiter.check("user-1");

    expect(r1).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(r2).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(r3).toEqual({ allowed: true, retryAfterMs: 0 });
  });

  it("blocks at the limit and returns retryAfterMs > 0", () => {
    const limiter = new SlidingWindowRateLimiter(1000, 2);

    limiter.check("user-1");
    limiter.check("user-1");
    const result = limiter.check("user-1");

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks different keys independently", () => {
    const limiter = new SlidingWindowRateLimiter(1000, 1);

    const r1 = limiter.check("key-a");
    const r2 = limiter.check("key-b");

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);

    // key-a is now exhausted, key-b is also exhausted
    expect(limiter.check("key-a").allowed).toBe(false);
    expect(limiter.check("key-b").allowed).toBe(false);
  });

  it("allows requests again after the window expires", () => {
    const windowMs = 5000;
    const limiter = new SlidingWindowRateLimiter(windowMs, 1);

    const first = limiter.check("user-1");
    expect(first.allowed).toBe(true);

    const blocked = limiter.check("user-1");
    expect(blocked.allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(windowMs + 1);

    const afterExpiry = limiter.check("user-1");
    expect(afterExpiry.allowed).toBe(true);
    expect(afterExpiry.retryAfterMs).toBe(0);
  });
});
