import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Config } from "./config.js";

export interface AppDependencies {
  logError: (err: unknown) => void;
}

export function createApp(config: Config, deps: AppDependencies): Hono {
  const app = new Hono();

  // CORS allowlist from config.corsOrigins (no "*")
  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (config.corsOrigins.includes(origin)) {
          return origin;
        }
        return null;
      },
    }),
  );

  // Health check route
  app.get("/health", (c) => {
    return c.json({ status: "ok" }, 200);
  });

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
