import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AuthVariables } from "../auth/routes.js";
import { requireAuth } from "../auth/routes.js";
import type { AuthService } from "../auth/service.js";
import type { Config } from "../config.js";
import { DocumentTooLargeError } from "./repositories.js";
import type { ProjectService } from "./service.js";

export const PROJECT_BODY_LIMIT_BYTES = 6_000_000;
const MAX_INT32 = 2_147_483_647;

export interface ProjectRoutesDependencies {
  service: ProjectService;
  authService: AuthService;
  config: Config;
}

export function createProjectRoutes(
  deps: ProjectRoutesDependencies,
): Hono<{ Variables: AuthVariables }> {
  const { service, authService, config } = deps;
  const projectsApp = new Hono<{ Variables: AuthVariables }>();

  // 1. All /api/projects responses carry Cache-Control: no-store
  projectsApp.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });

  // 2. CSRF Origin Check for POST/PUT/PATCH/DELETE
  projectsApp.use("*", async (c, next) => {
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

  // 3. Authentication check: auth BEFORE body limit / parsing
  projectsApp.use("*", requireAuth(authService, config));

  // 4. Content-Type check for POST and PUT
  projectsApp.use("*", async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (["POST", "PUT"].includes(method)) {
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
    await next();
  });

  // 5. Body limit (6 MB) with JSON 413 error
  projectsApp.use(
    "*",
    bodyLimit({
      maxSize: PROJECT_BODY_LIMIT_BYTES,
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

  async function parseJsonBody(
    c: Context,
  ): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
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

  // 1. GET /api/projects -> 200 { projects: [...] }
  projectsApp.get("/", async (c) => {
    const user = c.get("user");
    const res = await service.list(user.id);
    if (!res.ok) {
      return c.json({ error: { code: "internal", message: "Failed to list projects" } }, 500);
    }
    return c.json({ projects: res.data.projects }, 200);
  });

  // 2. POST /api/projects -> 201 { project, version }
  projectsApp.post("/", async (c) => {
    const parsed = await parseJsonBody(c);
    if (!parsed.ok) return parsed.res;

    const user = c.get("user");
    try {
      const res = await service.create(user.id, parsed.body);
      if (!res.ok) {
        if (res.code === "rate-limited") {
          c.header("Retry-After", String(res.retryAfterSeconds));
          return c.json(
            {
              error: {
                code: "rate-limited",
                message: res.message ?? "Too many requests",
              },
            },
            429,
          );
        }
        if (res.code === "unsupported-schema-version") {
          return c.json(
            {
              error: {
                code: "unsupported-schema-version",
                message: res.message ?? "Unsupported schema version",
                supported: res.supported,
                details: res.details,
              },
            },
            422,
          );
        }
        if (res.code === "project-limit-reached") {
          return c.json(
            {
              error: {
                code: "project-limit-reached",
                message: res.message ?? "Project limit reached",
              },
            },
            409,
          );
        }
        const details = "details" in res ? res.details : [];
        return c.json(
          {
            error: {
              code: "invalid-request",
              message: res.message ?? "Invalid request",
              details,
            },
          },
          400,
        );
      }

      return c.json(
        {
          project: res.data.project,
          version: res.data.version,
        },
        201,
      );
    } catch (err) {
      if (err instanceof DocumentTooLargeError) {
        return c.json(
          {
            error: {
              code: "document-too-large",
              message: "Document exceeds maximum allowed size",
            },
          },
          413,
        );
      }
      throw err;
    }
  });

  // 3. GET /api/projects/:id -> 200 { project, version, document }
  projectsApp.get("/:id", async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");

    const res = await service.get({ id, ownerId: user.id });
    if (!res.ok) {
      return c.json(
        {
          error: {
            code: "not-found",
            message: "Not found",
          },
        },
        404,
      );
    }

    return c.json(
      {
        project: res.data.project,
        version: res.data.version,
        document: res.data.document,
      },
      200,
    );
  });

  // 4. PUT /api/projects/:id -> 200 { project, version }
  projectsApp.put("/:id", async (c) => {
    const id = c.req.param("id");
    const parsed = await parseJsonBody(c);
    if (!parsed.ok) return parsed.res;

    const user = c.get("user");
    try {
      const res = await service.save({ id, ownerId: user.id, raw: parsed.body });
      if (!res.ok) {
        if (res.code === "rate-limited") {
          c.header("Retry-After", String(res.retryAfterSeconds));
          return c.json(
            {
              error: {
                code: "rate-limited",
                message: res.message ?? "Too many requests",
              },
            },
            429,
          );
        }
        if (res.code === "not-found") {
          return c.json(
            {
              error: {
                code: "not-found",
                message: "Not found",
              },
            },
            404,
          );
        }
        if (res.code === "version-conflict") {
          return c.json(
            {
              error: {
                code: "version-conflict",
                message: res.message ?? "Version conflict",
                currentVersion: res.currentVersion,
              },
            },
            409,
          );
        }
        if (res.code === "unsupported-schema-version") {
          return c.json(
            {
              error: {
                code: "unsupported-schema-version",
                message: res.message ?? "Unsupported schema version",
                supported: res.supported,
                details: res.details,
              },
            },
            422,
          );
        }
        const details = "details" in res ? res.details : [];
        return c.json(
          {
            error: {
              code: "invalid-request",
              message: res.message ?? "Invalid request",
              details,
            },
          },
          400,
        );
      }

      return c.json(
        {
          project: res.data.project,
          version: res.data.version,
        },
        200,
      );
    } catch (err) {
      if (err instanceof DocumentTooLargeError) {
        return c.json(
          {
            error: {
              code: "document-too-large",
              message: "Document exceeds maximum allowed size",
            },
          },
          413,
        );
      }
      throw err;
    }
  });

  // 5. GET /api/projects/:id/versions -> 200 { versions: [...] }
  projectsApp.get("/:id/versions", async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");

    const res = await service.listVersions({ id, ownerId: user.id });
    if (!res.ok) {
      return c.json(
        {
          error: {
            code: "not-found",
            message: "Not found",
          },
        },
        404,
      );
    }

    return c.json({ versions: res.data.versions }, 200);
  });

  // 6. GET /api/projects/:id/versions/:n -> 200 { version, document }
  projectsApp.get("/:id/versions/:n", async (c) => {
    const id = c.req.param("id");
    const nStr = c.req.param("n");
    const user = c.get("user");

    if (!/^\d+$/.test(nStr)) {
      return c.json(
        {
          error: {
            code: "not-found",
            message: "Not found",
          },
        },
        404,
      );
    }

    const n = Number(nStr);
    if (!Number.isInteger(n) || n < 1 || n > MAX_INT32) {
      return c.json(
        {
          error: {
            code: "not-found",
            message: "Not found",
          },
        },
        404,
      );
    }

    const res = await service.getVersion({ id, ownerId: user.id, versionNumber: n });
    if (!res.ok) {
      return c.json(
        {
          error: {
            code: "not-found",
            message: "Not found",
          },
        },
        404,
      );
    }

    return c.json(
      {
        version: res.data.version,
        document: res.data.document,
      },
      200,
    );
  });

  // 7. DELETE /api/projects/:id -> 204
  projectsApp.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");

    const res = await service.delete({ id, ownerId: user.id });
    if (!res.ok) {
      if (res.code === "rate-limited") {
        c.header("Retry-After", String(res.retryAfterSeconds));
        return c.json(
          {
            error: {
              code: "rate-limited",
              message: res.message ?? "Too many requests",
            },
          },
          429,
        );
      }
      return c.json(
        {
          error: {
            code: "not-found",
            message: "Not found",
          },
        },
        404,
      );
    }

    return c.body(null, 204);
  });

  return projectsApp;
}
