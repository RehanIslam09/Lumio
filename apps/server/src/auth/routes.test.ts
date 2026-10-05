import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import type { Config } from "../config.js";
import { createFakeSessionRepo, createFakeUserRepo } from "./fakes.js";
import type { PasswordHasher } from "./passwordHasher.js";
import { requireAuth } from "./routes.js";
import { createAuthService } from "./service.js";

function makeFakeHasher(): PasswordHasher {
  return {
    async hash(pw: string) {
      return `hashed_${pw}`;
    },
    async verify(hash: string, pw: string) {
      return hash === `hashed_${pw}`;
    },
  };
}

const baseDevConfig: Config = {
  port: 3001,
  nodeEnv: "development",
  databaseUrl: "postgresql://localhost:5432/lumio_test",
  corsOrigins: ["http://localhost:5173", "https://lumio.app"],
  sessionTtlDays: 30,
};

const baseProdConfig: Config = {
  ...baseDevConfig,
  nodeEnv: "production",
};

describe("auth routes module", () => {
  function setupTestApp(config: Config = baseDevConfig, hasher = makeFakeHasher()) {
    const logError = vi.fn();
    const users = createFakeUserRepo();
    const sessions = createFakeSessionRepo();
    const service = createAuthService({
      users,
      sessions,
      hasher,
      config: { sessionTtlDays: config.sessionTtlDays },
    });

    const app = createApp(config, {
      logError,
      auth: {
        service,
        getClientAddress: () => "127.0.0.1",
      },
    });

    return { app, service, users, sessions, logError };
  }

  it("CSRF matrix: POST requires valid Origin in corsOrigins; GET is exempt", async () => {
    const { app } = setupTestApp();

    // 1. POST without Origin -> 403 { error: { code: "csrf" } }
    const resNoOrigin = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "password12345" }),
    });
    expect(resNoOrigin.status).toBe(403);
    const bodyNoOrigin = await resNoOrigin.json();
    expect(bodyNoOrigin).toEqual({
      error: { code: "csrf", message: "Forbidden: invalid or missing Origin header" },
    });

    // 2. POST with disallowed Origin -> 403
    const resBadOrigin = await app.request("/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://malicious-site.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "user@example.com", password: "password12345" }),
    });
    expect(resBadOrigin.status).toBe(403);

    // 3. POST with allowed Origin -> 201
    const resAllowed = await app.request("/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "user@example.com", password: "password12345" }),
    });
    expect(resAllowed.status).toBe(201);

    // 4. GET /api/auth/me is exempt from Origin check
    const resGet = await app.request("/api/auth/me", {
      method: "GET",
    });
    // Not 403 CSRF (returns 401 unauthenticated because no cookie sent)
    expect(resGet.status).toBe(401);
  });

  it("body validation: 415 unsupported media type, 413 payload too large, 400 invalid JSON", async () => {
    const { app } = setupTestApp();

    // 1. 415 for non-JSON content type
    const res415 = await app.request("/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "text/plain",
      },
      body: "email=test@example.com",
    });
    expect(res415.status).toBe(415);
    expect(await res415.json()).toEqual({
      error: { code: "unsupported-media-type", message: "Content-Type must be application/json" },
    });

    // 2. 413 payload-too-large WITH Content-Length header (> 16 KB)
    const bigString = "x".repeat(17 * 1024);
    const bigPayload = JSON.stringify({ email: "a@b.com", password: "p", extra: bigString });
    const res413WithLength = await app.request("/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(bigPayload)),
      },
      body: bigPayload,
    });
    expect(res413WithLength.status).toBe(413);
    expect(await res413WithLength.json()).toEqual({
      error: { code: "payload-too-large", message: "Payload too large" },
    });

    // 3. 413 payload-too-large WITHOUT Content-Length header (streamed chunked body > 16 KB)
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(bigPayload));
        controller.close();
      },
    });
    // RequestInit without Content-Length
    const reqStream = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: stream,
      // @ts-expect-error duplex required for streaming in Node
      duplex: "half",
    });
    const res413Stream = await app.request(reqStream);
    expect(res413Stream.status).toBe(413);
    expect(await res413Stream.json()).toEqual({
      error: { code: "payload-too-large", message: "Payload too large" },
    });

    // 4. 400 invalid-request for malformed JSON (never reaches 500 handler)
    const res400 = await app.request("/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: "{ not valid json ...",
    });
    expect(res400.status).toBe(400);
    expect(await res400.json()).toEqual({
      error: { code: "invalid-request", message: "Invalid JSON" },
    });
  });

  it("Set-Cookie attributes in development: lumio_session, HttpOnly, SameSite=Lax, Path=/, NO Secure, NO Domain", async () => {
    const { app } = setupTestApp(baseDevConfig);

    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "dev@example.com", password: "password12345" }),
    });

    expect(res.status).toBe(201);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    if (!setCookie) return;

    expect(setCookie.startsWith("lumio_session=")).toBe(true);
    expect(setCookie.includes("HttpOnly")).toBe(true);
    expect(setCookie.includes("SameSite=Lax")).toBe(true);
    expect(setCookie.includes("Path=/")).toBe(true);
    expect(setCookie.includes("Max-Age=")).toBe(true);
    expect(setCookie.includes("Secure")).toBe(false);
    expect(setCookie.toLowerCase().includes("domain")).toBe(false);
  });

  it("Set-Cookie attributes in production: __Host-lumio_session, HttpOnly, SameSite=Lax, Path=/, Secure, NO Domain", async () => {
    const { app } = setupTestApp(baseProdConfig);

    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "prod@example.com", password: "password12345" }),
    });

    expect(res.status).toBe(201);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    if (!setCookie) return;

    expect(setCookie.startsWith("__Host-lumio_session=")).toBe(true);
    expect(setCookie.includes("HttpOnly")).toBe(true);
    expect(setCookie.includes("SameSite=Lax")).toBe(true);
    expect(setCookie.includes("Path=/")).toBe(true);
    expect(setCookie.includes("Secure")).toBe(true);
    expect(setCookie.includes("Max-Age=")).toBe(true);
    expect(setCookie.toLowerCase().includes("domain")).toBe(false);
  });

  it("logout clears cookie with Max-Age=0 and same name and attributes", async () => {
    const { app } = setupTestApp(baseDevConfig);

    const res = await app.request("/api/auth/logout", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
    });

    expect(res.status).toBe(204);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    if (!setCookie) return;

    expect(setCookie.startsWith("lumio_session=")).toBe(true);
    expect(setCookie.includes("Max-Age=0")).toBe(true);
    expect(setCookie.includes("Path=/")).toBe(true);
  });

  it("all /api/auth responses carry Cache-Control: no-store", async () => {
    const { app } = setupTestApp();

    const resMe = await app.request("/api/auth/me");
    expect(resMe.headers.get("cache-control")).toBe("no-store");

    const resLogout = await app.request("/api/auth/logout", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
    });
    expect(resLogout.headers.get("cache-control")).toBe("no-store");
  });

  it("CORS credentials header is present for allowed origin and absent for disallowed origin", async () => {
    const { app } = setupTestApp();

    // Allowed origin
    const resAllowed = await app.request("/api/auth/me", {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(resAllowed.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(resAllowed.headers.get("access-control-allow-credentials")).toBe("true");

    // Disallowed origin
    const resBad = await app.request("/api/auth/me", {
      headers: { Origin: "http://evil.com" },
    });
    expect(resBad.headers.get("access-control-allow-origin")).toBeNull();
    expect(resBad.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("response bodies never contain hash, argon2, or the password", async () => {
    const { app } = setupTestApp();

    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "secrecy@example.com",
        password: "superSecretPassword123!",
      }),
    });

    const text = await res.text();
    expect(text.toLowerCase().includes("hash")).toBe(false);
    expect(text.toLowerCase().includes("argon2")).toBe(false);
    expect(text.includes("superSecretPassword123!")).toBe(false);
  });

  it("hasher that throws triggers generic 500 without leaking password", async () => {
    const explodingHasher: PasswordHasher = {
      async hash() {
        throw new Error("Argon2 native library segfault or catastrophic failure");
      },
      async verify() {
        throw new Error("Explosion in verify");
      },
    };

    const { app, logError } = setupTestApp(baseDevConfig, explodingHasher);

    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "explode@example.com",
        password: "secretPassword123!",
      }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "internal", message: "Internal server error" },
    });
    expect(JSON.stringify(body).includes("secretPassword123!")).toBe(false);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("Cookie round trip in development: register -> Set-Cookie -> Cookie header on /me -> 200", async () => {
    const { app } = setupTestApp(baseDevConfig);

    const regRes = await app.request("/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "roundtrip-dev@example.com", password: "password12345" }),
    });

    expect(regRes.status).toBe(201);
    const setCookie = regRes.headers.get("set-cookie") ?? "";
    const cookieHeader = setCookie.split(";")[0] ?? ""; // "lumio_session=..."

    const meRes = await app.request("/api/auth/me", {
      headers: { Cookie: cookieHeader },
    });
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.user.email).toBe("roundtrip-dev@example.com");
  });

  it("Cookie round trip in production: register -> Set-Cookie (__Host-) -> Cookie header on /me -> 200", async () => {
    const { app } = setupTestApp(baseProdConfig);

    const regRes = await app.request("/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "roundtrip-prod@example.com", password: "password12345" }),
    });

    expect(regRes.status).toBe(201);
    const setCookie = regRes.headers.get("set-cookie") ?? "";
    expect(setCookie.startsWith("__Host-lumio_session=")).toBe(true);
    const cookieHeader = setCookie.split(";")[0] ?? ""; // "__Host-lumio_session=..."

    const meRes = await app.request("/api/auth/me", {
      headers: { Cookie: cookieHeader },
    });
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.user.email).toBe("roundtrip-prod@example.com");
  });

  it("requireAuth middleware protects route and attaches public user", async () => {
    const { service, app } = setupTestApp(baseDevConfig);

    // Add a protected test route
    app.get("/test-protected", requireAuth(service, baseDevConfig), (c) => {
      const user = c.get("user");
      return c.json({ protectedData: true, user });
    });

    // 1. Without cookie -> 401
    const resNoAuth = await app.request("/test-protected");
    expect(resNoAuth.status).toBe(401);
    expect(await resNoAuth.json()).toEqual({
      error: { code: "unauthenticated", message: "Authentication required" },
    });

    // 2. With valid session cookie -> 200
    const reg = await service.register(
      { email: "protected@example.com", password: "password12345" },
      { clientAddress: "127.0.0.1" },
    );
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;

    const resAuth = await app.request("/test-protected", {
      headers: { Cookie: `lumio_session=${reg.token}` },
    });
    expect(resAuth.status).toBe(200);
    const body = await resAuth.json();
    expect(body.protectedData).toBe(true);
    expect(body.user.email).toBe("protected@example.com");
  });
});
