import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { Config } from "./config.js";

const testConfig: Config = {
  port: 3001,
  nodeEnv: "test",
  databaseUrl: "postgresql://lumio:secret@localhost:5432/lumio_test",
  corsOrigins: ["http://localhost:5173", "https://lumio.app"],
};

describe("createApp", () => {
  it("GET /health returns 200 with status ok", async () => {
    const logError = vi.fn();
    const app = createApp(testConfig, { logError });

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("unknown route returns 404 JSON error", async () => {
    const logError = vi.fn();
    const app = createApp(testConfig, { logError });

    const res = await app.request("/unknown-route");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");

    const body = await res.json();
    expect(body).toEqual({
      error: {
        code: "not-found",
        message: "Not found",
      },
    });
  });

  it("handles thrown errors with 500 JSON without leaking stack trace", async () => {
    const logError = vi.fn();
    const app = createApp(testConfig, { logError });

    // Add a route that throws an internal error for testing
    app.get("/test-error", () => {
      throw new Error("Internal secret explosion: /etc/passwd or credentials leaked!");
    });

    const res = await app.request("/test-error");
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("application/json");

    const body = await res.json();
    expect(body).toEqual({
      error: {
        code: "internal",
        message: "Internal server error",
      },
    });

    // Ensure error was logged via dependency
    expect(logError).toHaveBeenCalledTimes(1);
    const logged = logError.mock.calls[0]?.[0];
    expect(logged).toBeInstanceOf(Error);
  });

  it("allows CORS for allowed origins on normal requests", async () => {
    const logError = vi.fn();
    const app = createApp(testConfig, { logError });

    const res = await app.request("/health", {
      headers: {
        Origin: "http://localhost:5173",
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(res.headers.get("vary")).toContain("Origin");
  });

  it("allows CORS preflight (OPTIONS) for allowed origin", async () => {
    const logError = vi.fn();
    const app = createApp(testConfig, { logError });

    const res = await app.request("/health", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  it("does not allow CORS for unauthorized origins", async () => {
    const logError = vi.fn();
    const app = createApp(testConfig, { logError });

    const res = await app.request("/health", {
      headers: {
        Origin: "http://unauthorized-evil-domain.com",
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("never returns wildcard '*' Access-Control-Allow-Origin", async () => {
    const logError = vi.fn();
    const app = createApp(testConfig, { logError });

    const res = await app.request("/health", {
      headers: {
        Origin: "*",
      },
    });

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
