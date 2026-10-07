import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "@repo/schema";
import { createApp } from "../app.js";
import { createAuthService } from "../auth/service.js";
import { createFakeUserRepo, createFakeSessionRepo } from "../auth/fakes.js";
import { createRateLimiter } from "../auth/rateLimiter.js";
import type { Config } from "../config.js";
import { FakeProjectRepo } from "./fakes.js";
import { createProjectService } from "./service.js";
import { PROJECT_BODY_LIMIT_BYTES } from "./routes.js";

const TEST_CONFIG: Config = {
  port: 3001,
  nodeEnv: "test",
  databaseUrl: "postgresql://postgres:test@localhost:5432/lumio_test",
  corsOrigins: ["http://localhost:5173"],
  sessionTtlDays: 30,
};

function makeTestApp() {
  const users = createFakeUserRepo();
  const sessions = createFakeSessionRepo();
  const hasher = {
    hash: async (p: string) => `hashed_${p}`,
    verify: async (h: string, p: string) => h === `hashed_${p}`,
  };
  const authService = createAuthService({
    users,
    sessions,
    hasher,
    config: { sessionTtlDays: 30 },
  });

  const projectRepo = new FakeProjectRepo();
  const projectService = createProjectService({
    projects: projectRepo,
    limiter: createRateLimiter({ max: 60, windowMs: 60_000 }),
    limits: { maxProjectsPerUser: 10 },
  });

  const app = createApp(TEST_CONFIG, {
    logError: () => {},
    auth: { service: authService },
    projects: { service: projectService },
  });

  return { app, authService, projectService, users, sessions };
}

async function createAuthenticatedUser(fixture: ReturnType<typeof makeTestApp>) {
  const reg = await fixture.authService.register(
    { email: "user@example.com", password: "Password123!" },
    { clientAddress: "127.0.0.1" },
  );
  if (!reg.ok) throw new Error("Registration failed in test helper");
  return { user: reg.user, token: reg.token, cookie: `lumio_session=${reg.token}` };
}

function makeMinimalProject(name = "Test Project") {
  return {
    id: "proj-1",
    name,
    nodes: [
      { id: "node-1", type: "start", title: "Start" },
      { id: "node-2", type: "end", title: "End" },
    ],
    edges: [{ id: "edge-1", from: "node-1", to: "node-2" }],
    variables: [],
  };
}

describe("Projects Routes", () => {
  it("returns 401 on each of the 7 endpoints when unauthenticated", async () => {
    const fixture = makeTestApp();
    const dummyId = "11111111-1111-1111-1111-111111111111";

    const endpoints = [
      { method: "GET", path: "/api/projects" },
      { method: "POST", path: "/api/projects", body: JSON.stringify({ schemaVersion: 1, document: makeMinimalProject() }) },
      { method: "GET", path: `/api/projects/${dummyId}` },
      { method: "PUT", path: `/api/projects/${dummyId}`, body: JSON.stringify({ baseVersion: 1, schemaVersion: 1, document: makeMinimalProject() }) },
      { method: "GET", path: `/api/projects/${dummyId}/versions` },
      { method: "GET", path: `/api/projects/${dummyId}/versions/1` },
      { method: "DELETE", path: `/api/projects/${dummyId}` },
    ];

    for (const ep of endpoints) {
      const headers: Record<string, string> = {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      };
      const res = await fixture.app.request(ep.path, {
        method: ep.method,
        headers,
        body: ep.body,
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json).toEqual({
        error: {
          code: "unauthenticated",
          message: "Authentication required",
        },
      });
    }
  });

  it("enforces CSRF on POST, PUT, DELETE but exempts GET and OPTIONS", async () => {
    const fixture = makeTestApp();
    const { cookie } = await createAuthenticatedUser(fixture);
    const dummyId = "11111111-1111-1111-1111-111111111111";

    // 1. Mutating requests without Origin -> 403 CSRF
    const mutating = [
      { method: "POST", path: "/api/projects" },
      { method: "PUT", path: `/api/projects/${dummyId}` },
      { method: "DELETE", path: `/api/projects/${dummyId}` },
    ];

    for (const ep of mutating) {
      const res = await fixture.app.request(ep.path, {
        method: ep.method,
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("csrf");
    }

    // 2. GET is exempt from CSRF
    const getRes = await fixture.app.request("/api/projects", {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(getRes.status).toBe(200);
  });

  it("handles OPTIONS preflight for PUT and DELETE without session", async () => {
    const fixture = makeTestApp();
    const dummyId = "11111111-1111-1111-1111-111111111111";

    // 1. From allowed origin
    const preflightRes = await fixture.app.request(`/api/projects/${dummyId}`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    expect(preflightRes.status).toBe(204);
    expect(preflightRes.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(preflightRes.headers.get("Access-Control-Allow-Credentials")).toBe("true");

    // 2. From disallowed origin
    const badPreflight = await fixture.app.request(`/api/projects/${dummyId}`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://evil.com",
        "Access-Control-Request-Method": "DELETE",
      },
    });
    expect(badPreflight.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("enforces Content-Type application/json on POST and PUT", async () => {
    const fixture = makeTestApp();
    const { cookie } = await createAuthenticatedUser(fixture);

    const res = await fixture.app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "text/plain",
      },
      body: "not json",
    });

    expect(res.status).toBe(415);
    const json = await res.json();
    expect(json.error.code).toBe("unsupported-media-type");
  });

  it("enforces PROJECT_BODY_LIMIT_BYTES (6 MB) with 413 payload-too-large with and without Content-Length", async () => {
    const fixture = makeTestApp();
    const { cookie } = await createAuthenticatedUser(fixture);

    // 1. Payload exceeding 6 MB with Content-Length
    const largeBody = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      document: makeMinimalProject("a".repeat(PROJECT_BODY_LIMIT_BYTES + 100)),
    });

    const resWithCl = await fixture.app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
        "Content-Length": String(new TextEncoder().encode(largeBody).length),
      },
      body: largeBody,
    });

    expect(resWithCl.status).toBe(413);
    const jsonWithCl = await resWithCl.json();
    expect(jsonWithCl.error.code).toBe("payload-too-large");

    // 2. Unauthenticated request with huge body gets 401, not 413 (auth before body limit)
    const resNoAuth = await fixture.app.request("/api/projects", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
        "Content-Length": String(new TextEncoder().encode(largeBody).length),
      },
      body: largeBody,
    });
    expect(resNoAuth.status).toBe(401);
  });

  it("returns 400 invalid-request for malformed JSON", async () => {
    const fixture = makeTestApp();
    const { cookie } = await createAuthenticatedUser(fixture);

    const res = await fixture.app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: "{ not valid json ...",
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid-request");
  });

  it("returns unified 404 for bad uuid", async () => {
    const fixture = makeTestApp();
    const { cookie } = await createAuthenticatedUser(fixture);

    const res = await fixture.app.request("/api/projects/not-a-uuid", {
      method: "GET",
      headers: { Cookie: cookie },
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("not-found");
  });

  it("applies Cache-Control: no-store on all project endpoints", async () => {
    const fixture = makeTestApp();
    const { cookie } = await createAuthenticatedUser(fixture);

    const res = await fixture.app.request("/api/projects", {
      method: "GET",
      headers: { Cookie: cookie },
    });

    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("proves /api/auth rejects payloads >16 KB with 413, while a 100 KB project save succeeds", async () => {
    const fixture = makeTestApp();
    const { cookie } = await createAuthenticatedUser(fixture);

    // 1. /api/auth rejects >16 KB body with 413
    const auth17KbBody = JSON.stringify({
      email: "test@example.com",
      password: "a".repeat(17 * 1024),
    });
    const authRes = await fixture.app.request("/api/auth/login", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: auth17KbBody,
    });
    expect(authRes.status).toBe(413);

    // 2. /api/projects accepts ~100 KB project payload
    // Build ~100 KB valid project
    const largeTitle = "Scene ".repeat(2000); // ~12 KB each node
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      id: `node-${i}`,
      type: i === 0 ? ("start" as const) : ("scene" as const),
      title: `${largeTitle} ${i}`,
    }));
    const project100Kb = makeMinimalProject();
    project100Kb.nodes = nodes;

    const projBody = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      document: project100Kb,
    });
    expect(projBody.length).toBeGreaterThan(100_000);

    const projRes = await fixture.app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: projBody,
    });
    expect(projRes.status).toBe(201);
  });

  it("guarantees error bodies are completely free of document content", async () => {
    const fixture = makeTestApp();
    const { cookie } = await createAuthenticatedUser(fixture);

    const secretText = "TOP_SECRET_CONTENT_12345";
    const invalidDoc = makeMinimalProject(secretText);
    invalidDoc.nodes = [
      { id: "node-1", type: "start", title: `TitleWith${secretText}\u0000Byte` },
    ];

    const res = await fixture.app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: invalidDoc,
      }),
    });

    expect(res.status).toBe(400);
    const bodyText = await res.text();
    expect(bodyText).not.toContain(secretText);
  });
});
