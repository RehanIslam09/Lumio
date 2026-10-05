import crypto from "node:crypto";
import { EmailTakenError } from "../db/errors.js";
import { validateEmail } from "./email.js";
import { validatePassword } from "./password.js";
import type { PasswordHasher } from "./passwordHasher.js";
import { createRateLimiter, type RateLimiter } from "./rateLimiter.js";
import type { SessionRepo, UserPublic, UserRepo } from "./repositories.js";
import {
  generateSessionToken,
  hashSessionToken,
  isWellFormedToken,
  type RandomBytesFn,
} from "./token.js";

export const MAX_SESSIONS_PER_USER = 20;

export interface RequestContext {
  clientAddress: string;
  currentSessionToken?: string;
}

export type AuthInvalidRequestResult = {
  ok: false;
  code: "invalid-request";
  details: Array<{ path: string; message: string }>;
};

export type AuthEmailTakenResult = {
  ok: false;
  code: "email-taken";
};

export type AuthInvalidCredentialsResult = {
  ok: false;
  code: "invalid-credentials";
};

export type AuthRateLimitedResult = {
  ok: false;
  code: "rate-limited";
  retryAfterSeconds: number;
};

export type RegisterSuccessResult = {
  ok: true;
  user: UserPublic;
  token: string;
};

export type RegisterResult =
  | RegisterSuccessResult
  | AuthInvalidRequestResult
  | AuthEmailTakenResult
  | AuthRateLimitedResult;

export type LoginSuccessResult = {
  ok: true;
  user: UserPublic;
  token: string;
};

export type LoginResult =
  | LoginSuccessResult
  | AuthInvalidRequestResult
  | AuthInvalidCredentialsResult
  | AuthRateLimitedResult;

export interface AuthServiceRateLimiters {
  register?: RateLimiter;
  loginIp?: RateLimiter;
  loginEmail?: RateLimiter;
}

export interface AuthServiceDependencies {
  users: UserRepo;
  sessions: SessionRepo;
  hasher: PasswordHasher;
  limiter?: AuthServiceRateLimiters | RateLimiter;
  clock?: () => Date;
  randomBytes?: RandomBytesFn;
  config: {
    sessionTtlDays: number;
  };
}

export interface AuthService {
  register(input: unknown, ctx: RequestContext): Promise<RegisterResult>;
  login(input: unknown, ctx: RequestContext): Promise<LoginResult>;
  logout(token: string): Promise<void>;
  authenticate(token: string): Promise<UserPublic | null>;
}

function isRateLimiter(obj: unknown): obj is RateLimiter {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "check" in obj &&
    typeof (obj as RateLimiter).check === "function" &&
    "record" in obj &&
    typeof (obj as RateLimiter).record === "function"
  );
}

export function createAuthService(deps: AuthServiceDependencies): AuthService {
  const {
    users,
    sessions,
    hasher,
    clock = () => new Date(),
    randomBytes = crypto.randomBytes,
    config,
  } = deps;

  const sessionTtlMs = config.sessionTtlDays * 24 * 60 * 60 * 1000;

  // Initialize rate limiters (injected or default)
  let regLimiter: RateLimiter;
  let loginIpLimiter: RateLimiter;
  let loginEmailLimiter: RateLimiter;

  if (isRateLimiter(deps.limiter)) {
    regLimiter = deps.limiter;
    loginIpLimiter = deps.limiter;
    loginEmailLimiter = deps.limiter;
  } else if (deps.limiter) {
    const group = deps.limiter;
    regLimiter =
      group.register ??
      createRateLimiter({
        max: 5,
        windowMs: 3600_000,
        now: () => clock().getTime(),
      });
    loginIpLimiter =
      group.loginIp ??
      createRateLimiter({
        max: 10,
        windowMs: 900_000,
        now: () => clock().getTime(),
      });
    loginEmailLimiter =
      group.loginEmail ??
      createRateLimiter({
        max: 10,
        windowMs: 900_000,
        now: () => clock().getTime(),
      });
  } else {
    regLimiter = createRateLimiter({
      max: 5,
      windowMs: 3600_000,
      now: () => clock().getTime(),
    });
    loginIpLimiter = createRateLimiter({
      max: 10,
      windowMs: 900_000,
      now: () => clock().getTime(),
    });
    loginEmailLimiter = createRateLimiter({
      max: 10,
      windowMs: 900_000,
      now: () => clock().getTime(),
    });
  }

  // Directive 5: Dummy hash is started immediately upon construction
  const dummyHashPromise = Promise.resolve().then(() =>
    hasher.hash("dummy_constant_secret_string_for_timing_parity"),
  );
  dummyHashPromise.catch(() => {});

  return {
    async register(input: unknown, ctx: RequestContext): Promise<RegisterResult> {
      const details: Array<{ path: string; message: string }> = [];

      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
          ok: false,
          code: "invalid-request",
          details: [{ path: "body", message: "Request body must be a JSON object" }],
        };
      }

      const raw = input as Record<string, unknown>;
      const emailRes = validateEmail(raw.email);
      if (!emailRes.ok) {
        details.push({ path: "email", message: emailRes.reason });
      }

      const passRes = validatePassword(raw.password);
      if (!passRes.ok) {
        details.push({ path: "password", message: passRes.reason });
      }

      if (details.length > 0 || !emailRes.ok || !passRes.ok) {
        return {
          ok: false,
          code: "invalid-request",
          details: details.slice(0, 10),
        };
      }

      // Rate limit register by clientAddress (5/hour)
      const regLimitKey = isRateLimiter(deps.limiter)
        ? `reg:${ctx.clientAddress}`
        : ctx.clientAddress;

      const limitCheck = regLimiter.check(regLimitKey);
      if (!limitCheck.allowed) {
        return {
          ok: false,
          code: "rate-limited",
          retryAfterSeconds: limitCheck.retryAfterSeconds,
        };
      }
      regLimiter.record(regLimitKey);

      // Hash password
      const passwordHash = await hasher.hash(passRes.password);

      // Create user
      let user: UserPublic;
      try {
        user = await users.create({
          email: emailRes.email,
          passwordHash,
        });
      } catch (err) {
        if (err instanceof EmailTakenError) {
          return { ok: false, code: "email-taken" };
        }
        throw err;
      }

      // Create session
      const rawToken = generateSessionToken(randomBytes);
      const tokenHash = hashSessionToken(rawToken);
      const createdAt = clock();
      const expiresAt = new Date(createdAt.getTime() + sessionTtlMs);

      await sessions.create({
        userId: user.id,
        tokenHash,
        createdAt,
        expiresAt,
      });

      return {
        ok: true,
        user: { id: user.id, email: user.email },
        token: rawToken,
      };
    },

    async login(input: unknown, ctx: RequestContext): Promise<LoginResult> {
      const details: Array<{ path: string; message: string }> = [];

      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
          ok: false,
          code: "invalid-request",
          details: [{ path: "body", message: "Request body must be a JSON object" }],
        };
      }

      const raw = input as Record<string, unknown>;
      const emailRes = validateEmail(raw.email);
      if (!emailRes.ok) {
        details.push({ path: "email", message: emailRes.reason });
      }

      const passRes = validatePassword(raw.password);
      if (!passRes.ok) {
        details.push({ path: "password", message: passRes.reason });
      }

      if (details.length > 0 || !emailRes.ok || !passRes.ok) {
        return {
          ok: false,
          code: "invalid-request",
          details: details.slice(0, 10),
        };
      }

      // Rate limit check: clientAddress AND normalized email (10 failures / 15 min)
      const ipKey = isRateLimiter(deps.limiter)
        ? `lip:${ctx.clientAddress}`
        : ctx.clientAddress;
      const emailKey = isRateLimiter(deps.limiter)
        ? `lem:${emailRes.email}`
        : emailRes.email;

      const ipCheck = loginIpLimiter.check(ipKey);
      const emailCheck = loginEmailLimiter.check(emailKey);

      if (!ipCheck.allowed || !emailCheck.allowed) {
        const retryAfterSeconds = Math.max(
          !ipCheck.allowed ? ipCheck.retryAfterSeconds : 0,
          !emailCheck.allowed ? emailCheck.retryAfterSeconds : 0,
        );
        return {
          ok: false,
          code: "rate-limited",
          retryAfterSeconds,
        };
      }

      const user = await users.findByEmail(emailRes.email);

      if (!user) {
        // Timing parity: verify against dummy hash
        const dummyHash = await dummyHashPromise;
        await hasher.verify(dummyHash, passRes.password);

        // Record failure
        loginIpLimiter.record(ipKey);
        loginEmailLimiter.record(emailKey);

        return { ok: false, code: "invalid-credentials" };
      }

      const isPwValid = await hasher.verify(user.passwordHash, passRes.password);
      if (!isPwValid) {
        // Record failure
        loginIpLimiter.record(ipKey);
        loginEmailLimiter.record(emailKey);

        return { ok: false, code: "invalid-credentials" };
      }

      // On success: do NOT record failure, neither count nor reset
      // Prevent session fixation: delete old presented session if any
      if (
        ctx.currentSessionToken &&
        isWellFormedToken(ctx.currentSessionToken)
      ) {
        const oldHash = hashSessionToken(ctx.currentSessionToken);
        await sessions.deleteByTokenHash(oldHash);
      }

      // Delete expired sessions for user
      await sessions.deleteExpiredForUser(user.id, clock());

      // Create new session
      const rawToken = generateSessionToken(randomBytes);
      const tokenHash = hashSessionToken(rawToken);
      const createdAt = clock();
      const expiresAt = new Date(createdAt.getTime() + sessionTtlMs);

      await sessions.create({
        userId: user.id,
        tokenHash,
        createdAt,
        expiresAt,
      });

      // Trim to MAX_SESSIONS_PER_USER newest
      await sessions.trimToNewest(user.id, MAX_SESSIONS_PER_USER);

      return {
        ok: true,
        user: { id: user.id, email: user.email },
        token: rawToken,
      };
    },

    async authenticate(token: string): Promise<UserPublic | null> {
      if (!isWellFormedToken(token)) {
        return null;
      }

      const tokenHash = hashSessionToken(token);
      const session = await sessions.findByTokenHash(tokenHash);
      if (!session) {
        return null;
      }

      const now = clock();
      if (session.expiresAt.getTime() <= now.getTime()) {
        await sessions.deleteByTokenHash(tokenHash);
        return null;
      }

      return users.findPublicById(session.userId);
    },

    async logout(token: string): Promise<void> {
      if (!isWellFormedToken(token)) {
        return;
      }
      const tokenHash = hashSessionToken(token);
      await sessions.deleteByTokenHash(tokenHash);
    },
  };
}
