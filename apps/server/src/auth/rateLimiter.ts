export interface RateLimiterOptions {
  max: number;
  windowMs: number;
  now?: () => number;
  maxKeys?: number;
}

export type RateLimitCheckResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  check(key: string): RateLimitCheckResult;
  record(key: string): void;
  size(): number;
}

const DEFAULT_MAX_KEYS = 10_000;

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { max, windowMs, now = Date.now, maxKeys = DEFAULT_MAX_KEYS } = options;

  // Map of key -> array of hit timestamps (ascending order)
  const store = new Map<string, number[]>();

  function purgeExpiredForKey(key: string, currentTime: number): number[] {
    const timestamps = store.get(key);
    if (!timestamps) {
      return [];
    }
    const cutoff = currentTime - windowMs;
    // Find index of first timestamp >= cutoff
    const valid = timestamps.filter((t) => t >= cutoff);
    if (valid.length === 0) {
      store.delete(key);
    } else {
      store.set(key, valid);
    }
    return valid;
  }

  function evictAtCap(currentTime: number): void {
    if (store.size <= maxKeys) {
      return;
    }

    // 1. Evict any key whose timestamps are all expired
    const cutoff = currentTime - windowMs;
    for (const [key, timestamps] of store.entries()) {
      if (timestamps.every((t) => t < cutoff)) {
        store.delete(key);
        if (store.size <= maxKeys) {
          return;
        }
      }
    }

    // 2. If still over cap, evict the oldest key (Map keys iterator order or oldest timestamp)
    while (store.size > maxKeys) {
      const oldestKey = store.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      store.delete(oldestKey);
    }
  }

  return {
    check(key: string): RateLimitCheckResult {
      const currentTime = now();
      const valid = purgeExpiredForKey(key, currentTime);

      if (valid.length >= max) {
        const oldestValid = valid[0] ?? currentTime;
        const expiresAt = oldestValid + windowMs;
        const retryAfterMs = Math.max(0, expiresAt - currentTime);
        const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
        return { allowed: false, retryAfterSeconds };
      }

      return { allowed: true };
    },

    record(key: string): void {
      const currentTime = now();
      const valid = purgeExpiredForKey(key, currentTime);
      valid.push(currentTime);

      // Re-insert to refresh Map insertion order (moves key to newest)
      store.delete(key);
      store.set(key, valid);

      evictAtCap(currentTime);
    },

    size(): number {
      return store.size;
    },
  };
}
