import { describe, expect, it } from "vitest";
import { resolveApiBaseUrl, DEFAULT_API_BASE_URL } from "./config.js";

describe("resolveApiBaseUrl", () => {
  it("defaults to localhost:3001 on undefined", () => {
    const res = resolveApiBaseUrl(undefined);
    expect(res).toEqual({ ok: true, baseUrl: "http://localhost:3001" });
  });

  it("defaults to localhost:3001 on empty string or whitespace", () => {
    expect(resolveApiBaseUrl("")).toEqual({ ok: true, baseUrl: DEFAULT_API_BASE_URL });
    expect(resolveApiBaseUrl("   ")).toEqual({ ok: true, baseUrl: DEFAULT_API_BASE_URL });
  });

  it("accepts valid http and https URLs and strips trailing slash", () => {
    expect(resolveApiBaseUrl("http://localhost:3001/")).toEqual({
      ok: true,
      baseUrl: "http://localhost:3001",
    });
    expect(resolveApiBaseUrl("https://api.lumio.app/")).toEqual({
      ok: true,
      baseUrl: "https://api.lumio.app",
    });
    expect(resolveApiBaseUrl("https://api.lumio.app:8443")).toEqual({
      ok: true,
      baseUrl: "https://api.lumio.app:8443",
    });
  });

  it("rejects non-http/https protocols", () => {
    const res = resolveApiBaseUrl("ws://localhost:3001");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/protocol/i);
    }
  });

  it("rejects credentials in URL", () => {
    const res = resolveApiBaseUrl("http://user:pass@localhost:3001");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/credentials/i);
    }
  });

  it("rejects query and hash", () => {
    expect(resolveApiBaseUrl("http://localhost:3001?foo=bar").ok).toBe(false);
    expect(resolveApiBaseUrl("http://localhost:3001#fragment").ok).toBe(false);
  });

  it("rejects path prefixes", () => {
    const res = resolveApiBaseUrl("http://localhost:3001/api/v1");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/path prefix/i);
    }
  });

  it("rejects malformed URLs without throwing", () => {
    const res = resolveApiBaseUrl("not-a-url");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeTruthy();
    }
  });
});
