import { describe, expect, it, vi } from "vitest";
import { createAuthService } from "./service.js";
import { createFakeSessionRepo, createFakeUserRepo } from "./fakes.js";
import { createRateLimiter } from "./rateLimiter.js";
import type { PasswordHasher } from "./passwordHasher.js";

describe("auth service module", () => {
  function makeFakeHasher(): PasswordHasher & {
    hashCalls: string[];
    verifyCalls: Array<{ hash: string; pw: string }>;
  } {
    const hashCalls: string[] = [];
    const verifyCalls: Array<{ hash: string; pw: string }> = [];
    return {
      hashCalls,
      verifyCalls,
      async hash(pw: string) {
        hashCalls.push(pw);
        return `hashed_${pw}`;
      },
      async verify(hash: string, pw: string) {
        verifyCalls.push({ hash, pw });
        return hash === `hashed_${pw}`;
      },
    };
  }

  it("dummy hash is computed upon construction, before any login", async () => {
    const hasher = makeFakeHasher();
    const users = createFakeUserRepo();
    const sessions = createFakeSessionRepo();

    expect(hasher.hashCalls).toHaveLength(0);
    const service = createAuthService({
      users,
      sessions,
      hasher,
      config: { sessionTtlDays: 30 },
    });

    // Allow microtasks to run so construction promise executes
    await Promise.resolve();
    expect(hasher.hashCalls).toHaveLength(1);

    // Login with unknown email: verifies against dummy hash exactly once
    const res = await service.login(
      { email: "unknown@example.com", password: "password12345" },
      { clientAddress: "127.0.0.1" },
    );
    expect(res).toEqual({ ok: false, code: "invalid-credentials" });
    expect(hasher.verifyCalls).toHaveLength(1);
    const firstVerify = hasher.verifyCalls[0];
    const firstHash = hasher.hashCalls[0];
    expect(firstVerify?.hash).toBe(`hashed_${firstHash ?? ""}`);
  });

  it("returns identical invalid-credentials for unknown email and wrong password", async () => {
    const hasher = makeFakeHasher();
    const users = createFakeUserRepo();
    const sessions = createFakeSessionRepo();
    const service = createAuthService({
      users,
      sessions,
      hasher,
      config: { sessionTtlDays: 30 },
    });

    // Register user
    await service.register(
      { email: "writer@example.com", password: "password12345" },
      { clientAddress: "127.0.0.1" },
    );

    // 1. Wrong password
    const wrongPwRes = await service.login(
      { email: "writer@example.com", password: "wrongPassword123" },
      { clientAddress: "127.0.0.1" },
    );

    // 2. Unknown email
    const unknownRes = await service.login(
      { email: "ghost@example.com", password: "wrongPassword123" },
      { clientAddress: "127.0.0.1" },
    );

    expect(wrongPwRes).toEqual({ ok: false, code: "invalid-credentials" });
    expect(unknownRes).toEqual({ ok: false, code: "invalid-credentials" });
    expect(wrongPwRes).toEqual(unknownRes);
  });

  it("session fixation: old session deleted and new session returned on login", async () => {
    const hasher = makeFakeHasher();
    const users = createFakeUserRepo();
    const sessions = createFakeSessionRepo();
    const service = createAuthService({
      users,
      sessions,
      hasher,
      config: { sessionTtlDays: 30 },
    });

    const reg = await service.register(
      { email: "fixation@example.com", password: "password12345" },
      { clientAddress: "127.0.0.1" },
    );
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;

    const oldToken = reg.token;
    expect(await service.authenticate(oldToken)).not.toBeNull();

    // Login presenting old token in context
    const log = await service.login(
      { email: "fixation@example.com", password: "password12345" },
      { clientAddress: "127.0.0.1", currentSessionToken: oldToken },
    );
    expect(log.ok).toBe(true);
    if (!log.ok) return;

    // Old token must be invalidated
    expect(await service.authenticate(oldToken)).toBeNull();
    // New token must be different and active
    expect(log.token).not.toBe(oldToken);
    expect(await service.authenticate(log.token)).not.toBeNull();
  });

  it("rate limits login after 10 failures and recovers after window", async () => {
    let mockTime = 1000;
    const hasher = makeFakeHasher();
    const users = createFakeUserRepo();
    const sessions = createFakeSessionRepo();
    const clock = () => new Date(mockTime);

    const loginLimiter = createRateLimiter({
      max: 10,
      windowMs: 15 * 60 * 1000,
      now: () => mockTime,
    });

    const service = createAuthService({
      users,
      sessions,
      hasher,
      clock,
      limiter: {
        register: createRateLimiter({ max: 5, windowMs: 3600_000, now: () => mockTime }),
        loginIp: loginLimiter,
        loginEmail: loginLimiter,
      },
      config: { sessionTtlDays: 30 },
    });

    await service.register(
      { email: "ratelimit@example.com", password: "validPassword123" },
      { clientAddress: "1.2.3.4" },
    );

    // 10 failed login attempts
    for (let i = 0; i < 10; i++) {
      const res = await service.login(
        { email: "ratelimit@example.com", password: "badPassword999" },
        { clientAddress: "1.2.3.4" },
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("invalid-credentials");
      }
    }

    // 11th attempt with CORRECT password is rate limited
    const blocked = await service.login(
      { email: "ratelimit@example.com", password: "validPassword123" },
      { clientAddress: "1.2.3.4" },
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe("rate-limited");
      expect((blocked as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
    }

    // Advance clock past 15 min window
    mockTime += 15 * 60 * 1000 + 1;
    const recovered = await service.login(
      { email: "ratelimit@example.com", password: "validPassword123" },
      { clientAddress: "1.2.3.4" },
    );
    expect(recovered.ok).toBe(true);
  });

  it("register is rate limited to 5 per hour per clientAddress", async () => {
    const mockTime = 1000;
    const hasher = makeFakeHasher();
    const users = createFakeUserRepo();
    const sessions = createFakeSessionRepo();
    const clock = () => new Date(mockTime);

    const regLimiter = createRateLimiter({
      max: 5,
      windowMs: 3600_000,
      now: () => mockTime,
    });

    const service = createAuthService({
      users,
      sessions,
      hasher,
      clock,
      limiter: {
        register: regLimiter,
        loginIp: createRateLimiter({ max: 10, windowMs: 900_000, now: () => mockTime }),
        loginEmail: createRateLimiter({ max: 10, windowMs: 900_000, now: () => mockTime }),
      },
      config: { sessionTtlDays: 30 },
    });

    for (let i = 1; i <= 5; i++) {
      const res = await service.register(
        { email: `user${i}@example.com`, password: "validPassword123" },
        { clientAddress: "9.9.9.9" },
      );
      expect(res.ok).toBe(true);
    }

    // 6th attempt is blocked
    const blocked = await service.register(
      { email: "user6@example.com", password: "validPassword123" },
      { clientAddress: "9.9.9.9" },
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe("rate-limited");
    }
  });

  it("authenticate: malformed token does not call repository and returns null", async () => {
    const users = createFakeUserRepo();
    const sessions = createFakeSessionRepo();
    const findByTokenHashSpy = vi.spyOn(sessions, "findByTokenHash");
    const service = createAuthService({
      users,
      sessions,
      hasher: makeFakeHasher(),
      config: { sessionTtlDays: 30 },
    });

    const malformed = ["short", "a".repeat(42), "a".repeat(44), "invalid+chars==", null, 123];
    for (const token of malformed) {
      const auth = await service.authenticate(token as string);
      expect(auth).toBeNull();
    }
    expect(findByTokenHashSpy).not.toHaveBeenCalled();
  });

  it("authenticate: expired token returns null and deletes the session", async () => {
    let mockTime = 1000;
    const users = createFakeUserRepo();
    const sessions = createFakeSessionRepo();
    const clock = () => new Date(mockTime);

    const service = createAuthService({
      users,
      sessions,
      hasher: makeFakeHasher(),
      clock,
      config: { sessionTtlDays: 30 },
    });

    const reg = await service.register(
      { email: "expiry@example.com", password: "password12345" },
      { clientAddress: "127.0.0.1" },
    );
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;

    // Advance clock past 30 days
    mockTime += 31 * 24 * 60 * 60 * 1000;
    const auth = await service.authenticate(reg.token);
    expect(auth).toBeNull();

    // Confirm session was deleted from repo
    expect(sessions.sessions.size).toBe(0);
  });

  it("logout deletes the session and is idempotent for junk", async () => {
    const users = createFakeUserRepo();
    const sessions = createFakeSessionRepo();
    const service = createAuthService({
      users,
      sessions,
      hasher: makeFakeHasher(),
      config: { sessionTtlDays: 30 },
    });

    const reg = await service.register(
      { email: "logout@example.com", password: "password12345" },
      { clientAddress: "127.0.0.1" },
    );
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;

    await service.logout(reg.token);
    expect(await service.authenticate(reg.token)).toBeNull();

    // Second logout of same token does not throw
    await expect(service.logout(reg.token)).resolves.not.toThrow();
    // Junk token does not throw
    await expect(service.logout("junk")).resolves.not.toThrow();
  });
});
