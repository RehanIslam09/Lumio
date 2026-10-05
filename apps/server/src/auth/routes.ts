import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Config, NodeEnv } from "../config.js";
import type { UserPublic } from "./repositories.js";
import type { AuthService } from "./service.js";

export const MAX_AUTH_BODY_BYTES = 16 * 1024; // 16 KB

export interface AuthVariables {
  user: UserPublic;
}

export type GetClientAddressFn = (c: Context) => string;

export function defaultGetClientAddress(c: Context): string {
  try {
    const info = getConnInfo(c);
    return info.remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function getSessionCookieName(nodeEnv: NodeEnv): string {
  return nodeEnv === "production" ? "__Host-lumio_session" : "lumio_session";
}

export interface AuthRoutesDependencies {
  service: AuthService;
  config: Config;
  getClientAddress?: GetClientAddressFn;
}

export function requireAuth(
  service: AuthService,
  config: Config,
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async function requireAuth(c, next) {
    const cookieName = getSessionCookieName(config.nodeEnv);
    const token = getCookie(c, cookieName);

    if (!token) {
      return c.json(
        {
          error: {
            code: "unauthenticated",
            message: "Authentication required",
          },
        },
        401,
      );
    }

    const user = await service.authenticate(token);
    if (!user) {
      return c.json(
        {
          error: {
            code: "unauthenticated",
            message: "Authentication required",
          },
        },
        401,
      );
    }

    c.set("user", user);
    await next();
  };
}

export function createAuthRoutes(
  deps: AuthRoutesDependencies,
): Hono<{ Variables: AuthVariables }> {
  const { service, config, getClientAddress = defaultGetClientAddress } = deps;
  const authApp = new Hono<{ Variables: AuthVariables }>();
  const cookieName = getSessionCookieName(config.nodeEnv);
  const isProd = config.nodeEnv === "production";

  // 1. All /api/auth responses carry Cache-Control: no-store
  authApp.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });

  // 2. CSRF Origin Check for POST/PUT/PATCH/DELETE
  authApp.use("*", async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const origin = c.req.header("origin");
      if (!origin || !config.corsOrigins.includes(origin)) {
        return c.json(
          {
            error: {
              code: "csrf",
              message: "Forbidden: invalid or missing Origin header",
            },
          },
          403,
        );
      }
    }
    await next();
  });

  // 3. Content-Type Check for POST/PUT/PATCH
  authApp.use("*", async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (["POST", "PUT", "PATCH"].includes(method)) {
      const isLogout = c.req.path.endsWith("/logout");
      const contentLength = c.req.header("content-length");
      const hasBody = contentLength !== undefined && contentLength !== "0";

      if (!isLogout || hasBody) {
        const contentType = c.req.header("content-type");
        if (!contentType || !contentType.toLowerCase().includes("application/json")) {
          return c.json(
            {
              error: {
                code: "unsupported-media-type",
                message: "Content-Type must be application/json",
              },
            },
            415,
          );
        }
      }
    }
    await next();
  });

  // 4. Body limit (16 KB) with JSON 413 error
  authApp.use(
    "*",
    bodyLimit({
      maxSize: MAX_AUTH_BODY_BYTES,
      onError: (c) => {
        return c.json(
          {
            error: {
              code: "payload-too-large",
              message: "Payload too large",
            },
          },
          413,
        );
      },
    }),
  );

  // Helper to safely parse JSON body mapping syntax error to 400
  async function parseJsonBody(c: Context): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
    try {
      const body = await c.req.json();
      return { ok: true, body };
    } catch {
      return {
        ok: false,
        res: c.json(
          {
            error: {
              code: "invalid-request",
              message: "Invalid JSON",
            },
          },
          400,
        ),
      };
    }
  }

  // Routes:
  // POST /register -> 201 + Set-Cookie
  authApp.post("/register", async (c) => {
    const parsed = await parseJsonBody(c);
    if (!parsed.ok) return parsed.res;

    const clientAddress = getClientAddress(c);
    const result = await service.register(parsed.body, { clientAddress });

    if (!result.ok) {
      if (result.code === "invalid-request") {
        return c.json(
          {
            error: {
              code: "invalid-request",
              message: "Invalid request",
              details: result.details,
            },
          },
          400,
        );
      }
      if (result.code === "email-taken") {
        return c.json(
          {
            error: {
              code: "email-taken",
              message: "Email is already registered",
            },
          },
          409,
        );
      }
      if (result.code === "rate-limited") {
        c.header("Retry-After", String(result.retryAfterSeconds));
        return c.json(
          {
            error: {
              code: "rate-limited",
              message: "Too many requests",
            },
          },
          429,
        );
      }
    }

    // Set cookie: HttpOnly, SameSite=Lax, Path=/, Max-Age=ttl, Secure in prod, NO Domain
    setCookie(c, cookieName, result.token, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: config.sessionTtlDays * 24 * 60 * 60,
      secure: isProd,
    });

    return c.json({ user: result.user }, 201);
  });

  // POST /login -> 200 + Set-Cookie
  authApp.post("/login", async (c) => {
    const parsed = await parseJsonBody(c);
    if (!parsed.ok) return parsed.res;

    const clientAddress = getClientAddress(c);
    const currentSessionToken = getCookie(c, cookieName);

    const result = await service.login(parsed.body, {
      clientAddress,
      currentSessionToken,
    });

    if (!result.ok) {
      if (result.code === "invalid-request") {
        return c.json(
          {
            error: {
              code: "invalid-request",
              message: "Invalid request",
              details: result.details,
            },
          },
          400,
        );
      }
      if (result.code === "invalid-credentials") {
        return c.json(
          {
            error: {
              code: "invalid-credentials",
              message: "Invalid email or password",
            },
          },
          401,
        );
      }
      if (result.code === "rate-limited") {
        c.header("Retry-After", String(result.retryAfterSeconds));
        return c.json(
          {
            error: {
              code: "rate-limited",
              message: "Too many requests",
            },
          },
          429,
        );
      }
    }

    setCookie(c, cookieName, result.token, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: config.sessionTtlDays * 24 * 60 * 60,
      secure: isProd,
    });

    return c.json({ user: result.user }, 200);
  });

  // POST /logout -> 204 + cookie cleared
  authApp.post("/logout", async (c) => {
    const token = getCookie(c, cookieName);
    if (token) {
      await service.logout(token);
    }

    deleteCookie(c, cookieName, {
      path: "/",
      secure: isProd,
    });

    return c.body(null, 204);
  });

  // GET /me -> 200 {user} or 401
  authApp.get("/me", async (c) => {
    const token = getCookie(c, cookieName);
    if (!token) {
      return c.json(
        {
          error: {
            code: "unauthenticated",
            message: "Authentication required",
          },
        },
        401,
      );
    }

    const user = await service.authenticate(token);
    if (!user) {
      return c.json(
        {
          error: {
            code: "unauthenticated",
            message: "Authentication required",
          },
        },
        401,
      );
    }

    return c.json({ user }, 200);
  });

  return authApp;
}
