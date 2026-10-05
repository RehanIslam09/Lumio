import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuthRoutes, type AuthRoutesDependencies } from "./auth/routes.js";
import type { Config } from "./config.js";

export interface AppDependencies {
  logError: (err: unknown) => void;
  auth?: {
    service: AuthRoutesDependencies["service"];
    getClientAddress?: AuthRoutesDependencies["getClientAddress"];
  };
}

export function createApp(config: Config, deps: AppDependencies): Hono {
  const app = new Hono();

  // CORS cleanup: strip credentials header if origin was not allowed
  app.use("*", async (c, next) => {
    await next();
    if (!c.res.headers.has("Access-Control-Allow-Origin")) {
      c.res.headers.delete("Access-Control-Allow-Credentials");
    }
  });

  // CORS allowlist from config.corsOrigins (no "*") with credentials: true
  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (config.corsOrigins.includes(origin)) {
          return origin;
        }
        return null;
      },
      credentials: true,
    }),
  );

  // Health check route
  app.get("/health", (c) => {
    return c.json({ status: "ok" }, 200);
  });

  // Mount auth sub-app at /api/auth if provided
  if (deps.auth) {
    const authApp = createAuthRoutes({
      service: deps.auth.service,
      config,
      getClientAddress: deps.auth.getClientAddress,
    });
    app.route("/api/auth", authApp);
  }

  // Unknown route -> 404 JSON error
  app.notFound((c) => {
    return c.json(
      {
        error: {
          code: "not-found",
          message: "Not found",
        },
      },
      404,
    );
  });

  // Thrown error -> 500 JSON error (no stack trace)
  app.onError((err, c) => {
    deps.logError(err);
    return c.json(
      {
        error: {
          code: "internal",
          message: "Internal server error",
        },
      },
      500,
    );
  });

  return app;
}
