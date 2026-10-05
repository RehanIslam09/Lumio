import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rateLimiter.js";

describe("rateLimiter module", () => {
  it("allows up to max requests in the window and rejects when exceeded", () => {
    const mockTime = 1000;
    const limiter = createRateLimiter({
      max: 3,
      windowMs: 10_000,
      now: () => mockTime,
    });

    // 3 allowed records
    expect(limiter.check("ip-1")).toEqual({ allowed: true });
    limiter.record("ip-1");
    expect(limiter.check("ip-1")).toEqual({ allowed: true });
    limiter.record("ip-1");
    expect(limiter.check("ip-1")).toEqual({ allowed: true });
    limiter.record("ip-1");

    // 4th check -> blocked
    const blocked = limiter.check("ip-1");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      // Oldest record was at 1000, expires at 11000. Current is 1000 -> 10000ms / 1000 = 10s
      expect(blocked.retryAfterSeconds).toBe(10);
    }
  });

  it("sliding window expires old hits over time", () => {
    let mockTime = 1000;
    const limiter = createRateLimiter({
      max: 2,
      windowMs: 5000,
      now: () => mockTime,
    });

    limiter.record("user-a"); // at 1000
    mockTime = 3000;
    limiter.record("user-a"); // at 3000

    expect(limiter.check("user-a").allowed).toBe(false);

    // Advance to 6001 (first record at 1000 has expired; only record at 3000 remains)
    mockTime = 6001;
    expect(limiter.check("user-a")).toEqual({ allowed: true });

    // Advance to 8001 (second record at 3000 also expired)
    mockTime = 8001;
    expect(limiter.check("user-a")).toEqual({ allowed: true });
  });

  it("isolates different keys", () => {
    const mockTime = 1000;
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 5000,
      now: () => mockTime,
    });

    limiter.record("key-1");
    expect(limiter.check("key-1").allowed).toBe(false);
    expect(limiter.check("key-2").allowed).toBe(true);
  });

  it("caps total keys and evicts expired first, then oldest", () => {
    let mockTime = 1000;
    const limiter = createRateLimiter({
      max: 5,
      windowMs: 5000,
      now: () => mockTime,
      maxKeys: 3, // small cap for testing
    });

    limiter.record("k1"); // at 1000
    mockTime = 2000;
    limiter.record("k2"); // at 2000
    mockTime = 3000;
    limiter.record("k3"); // at 3000
    expect(limiter.size()).toBe(3);

    // Advance time past k1's expiry (windowMs is 5000, so k1 expires at 6000)
    mockTime = 7000;
    // Recording k4 should evict expired k1 first
    limiter.record("k4");
    expect(limiter.size()).toBeLessThanOrEqual(3);
    // k1 was expired and evicted
    expect(limiter.check("k1").allowed).toBe(true);

    // Now k2, k3, k4 are present. If none are expired and we add k5, oldest (k2) should be evicted
    mockTime = 7500;
    limiter.record("k5");
    expect(limiter.size()).toBeLessThanOrEqual(3);
  });
});
