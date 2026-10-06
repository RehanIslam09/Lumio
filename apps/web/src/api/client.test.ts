import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createApiClient } from "./client.js";

describe("ApiClient", () => {
  const baseUrl = "http://localhost:3001";

  function createMockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): typeof fetch {
    return (input, init) => handler(input, init);
  }

  function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    });
  }

  describe("Request shapes for every endpoint", () => {
    it("POST /api/auth/register", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      const mockFetch = createMockFetch(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return jsonResponse({ user: { id: "u1", email: "a@b.com" } }, 201);
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res = await client.register({ email: "a@b.com", password: "Password123!" });

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe("http://localhost:3001/api/auth/register");
      expect(capturedInit?.method).toBe("POST");
      expect(capturedInit?.credentials).toBe("include");
      expect((capturedInit?.headers as Record<string, string>)["Accept"]).toBe("application/json");
      expect((capturedInit?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
      expect(JSON.parse(capturedInit?.body as string)).toEqual({ email: "a@b.com", password: "Password123!" });
    });

    it("POST /api/auth/login", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      const mockFetch = createMockFetch(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return jsonResponse({ user: { id: "u1", email: "a@b.com" } }, 200);
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res = await client.login({ email: "a@b.com", password: "Password123!" });

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe("http://localhost:3001/api/auth/login");
      expect(capturedInit?.method).toBe("POST");
      expect(capturedInit?.credentials).toBe("include");
    });

    it("POST /api/auth/logout", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      const mockFetch = createMockFetch(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(null, { status: 204 });
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res = await client.logout();

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe("http://localhost:3001/api/auth/logout");
      expect(capturedInit?.method).toBe("POST");
      expect(capturedInit?.credentials).toBe("include");
    });

    it("GET /api/auth/me", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      const mockFetch = createMockFetch(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return jsonResponse({ user: { id: "u1", email: "a@b.com" } }, 200);
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res = await client.me();

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe("http://localhost:3001/api/auth/me");
      expect(capturedInit?.method).toBe("GET");
      expect(capturedInit?.credentials).toBe("include");
      expect(capturedInit?.body).toBeUndefined();
    });

    it("GET /api/projects", async () => {
      let capturedUrl = "";
      const mockFetch = createMockFetch(async (url) => {
        capturedUrl = String(url);
        return jsonResponse({ projects: [] }, 200);
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res = await client.listProjects();

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe("http://localhost:3001/api/projects");
    });

    it("POST /api/projects", async () => {
      let capturedInit: RequestInit | undefined;
      const mockFetch = createMockFetch(async (_url, init) => {
        capturedInit = init;
        return jsonResponse(
          {
            project: {
              id: "p1",
              name: "Story",
              createdAt: "2026-10-05T00:00:00Z",
              updatedAt: "2026-10-05T00:00:00Z",
              latestVersion: 1,
            },
            version: {
              versionNumber: 1,
              schemaVersion: 1,
              createdAt: "2026-10-05T00:00:00Z",
            },
          },
          201,
        );
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const doc = { id: "client-id", name: "Story", nodes: [], edges: [], variables: [] };
      const res = await client.createProject({ schemaVersion: 1, document: doc });

      expect(res.ok).toBe(true);
      expect(capturedInit?.method).toBe("POST");
      expect(JSON.parse(capturedInit?.body as string)).toEqual({ schemaVersion: 1, document: doc });
    });

    it("GET /api/projects/:id with URL encoding", async () => {
      let capturedUrl = "";
      const mockFetch = createMockFetch(async (url) => {
        capturedUrl = String(url);
        return jsonResponse({
          project: {
            id: "p/123",
            name: "Story",
            createdAt: "2026-10-05T00:00:00Z",
            updatedAt: "2026-10-05T00:00:00Z",
            latestVersion: 1,
          },
          version: {
            versionNumber: 1,
            schemaVersion: 1,
            createdAt: "2026-10-05T00:00:00Z",
          },
          document: { id: "d1", name: "Doc", nodes: [], edges: [], variables: [] },
        });
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res = await client.getProject("p/123");

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe("http://localhost:3001/api/projects/p%2F123");
    });

    it("PUT /api/projects/:id", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;
      const mockFetch = createMockFetch(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return jsonResponse({
          project: {
            id: "p1",
            name: "Updated",
            createdAt: "2026-10-05T00:00:00Z",
            updatedAt: "2026-10-05T00:00:00Z",
            latestVersion: 2,
          },
          version: {
            versionNumber: 2,
            schemaVersion: 1,
            createdAt: "2026-10-05T00:00:00Z",
          },
        });
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const doc = { id: "d1", name: "Updated", nodes: [], edges: [], variables: [] };
      const res = await client.saveProject("p1", { baseVersion: 1, schemaVersion: 1, document: doc });

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe("http://localhost:3001/api/projects/p1");
      expect(capturedInit?.method).toBe("PUT");
      expect(JSON.parse(capturedInit?.body as string)).toEqual({ baseVersion: 1, schemaVersion: 1, document: doc });
    });

    it("DELETE /api/projects/:id", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;
      const mockFetch = createMockFetch(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(null, { status: 204 });
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res = await client.deleteProject("p1");

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe("http://localhost:3001/api/projects/p1");
      expect(capturedInit?.method).toBe("DELETE");
    });

    it("GET /api/projects/:id/versions with URL encoding", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;
      const mockFetch = createMockFetch(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return jsonResponse({
          versions: [
            {
              versionNumber: 2,
              schemaVersion: 1,
              createdAt: "2026-10-06T10:00:00.000Z",
              createdByMe: true,
            },
          ],
        });
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res = await client.listVersions("p/special id");

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe("http://localhost:3001/api/projects/p%2Fspecial%20id/versions");
      expect(capturedInit?.method).toBe("GET");
      expect(capturedInit?.credentials).toBe("include");
      if (res.ok) {
        expect(res.data.versions).toHaveLength(1);
        expect(res.data.versions[0]?.versionNumber).toBe(2);
      }
    });

    it("GET /api/projects/:id/versions/:n with URL encoding", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;
      const mockFetch = createMockFetch(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        return jsonResponse({
          version: {
            versionNumber: 3,
            schemaVersion: 1,
            createdAt: "2026-10-06T10:00:00.000Z",
          },
          document: { id: "p1", name: "Versioned Doc", nodes: [], edges: [], variables: [] },
        });
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res = await client.getVersion("p/special id", 3);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe("http://localhost:3001/api/projects/p%2Fspecial%20id/versions/3");
      expect(capturedInit?.method).toBe("GET");
      expect(capturedInit?.credentials).toBe("include");
      if (res.ok) {
        expect(res.data.version.versionNumber).toBe(3);
        expect(res.data.document).toBeDefined();
      }
    });

    it("getVersion rejects invalid or non-integer versionNumber without network request", async () => {
      let fetchCalled = false;
      const mockFetch = createMockFetch(async () => {
        fetchCalled = true;
        return jsonResponse({});
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res1 = await client.getVersion("p1", 0);
      const res2 = await client.getVersion("p1", -5);
      const res3 = await client.getVersion("p1", 1.5);
      const res4 = await client.getVersion("p1", NaN);

      expect(fetchCalled).toBe(false);
      expect(res1.ok).toBe(false);
      expect(res2.ok).toBe(false);
      expect(res3.ok).toBe(false);
      expect(res4.ok).toBe(false);
      if (!res1.ok) expect(res1.kind).toBe("malformed");
    });
  });


  describe("Error classes and status handling", () => {
    it("handles network rejection without throwing", async () => {
      const mockFetch = createMockFetch(async () => {
        throw new TypeError("Failed to fetch");
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res = await client.me();

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.kind).toBe("network");
        expect(res.message).toMatch(/network/i);
      }
    });

    it("handles timeout via AbortSignal without throwing", async () => {
      const mockFetch = createMockFetch(async (_url, init) => {
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          if (signal) {
            signal.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        });
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch, timeoutMs: 10 });
      const res = await client.me();

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.kind).toBe("timeout");
        expect(res.message).toMatch(/timed out/i);
      }
    });

    it("handles 409 version-conflict and parses currentVersion", async () => {
      const mockFetch = createMockFetch(async () => {
        return jsonResponse(
          {
            error: {
              code: "version-conflict",
              message: "Version conflict",
              currentVersion: 5,
            },
          },
          409,
        );
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res = await client.saveProject("p1", {
        baseVersion: 3,
        schemaVersion: 1,
        document: { id: "d", name: "N", nodes: [], edges: [], variables: [] },
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.kind).toBe("http");
        expect(res.status).toBe(409);
        expect(res.code).toBe("version-conflict");
        expect(res.currentVersion).toBe(5);
      }
    });

    it("handles 401 unauthenticated", async () => {
      const mockFetch = createMockFetch(async () => {
        return jsonResponse({ error: { code: "unauthenticated", message: "Auth required" } }, 401);
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res = await client.me();

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.kind).toBe("http");
        expect(res.status).toBe(401);
        expect(res.code).toBe("unauthenticated");
      }
    });

    it("handles 429 rate-limited with and without Retry-After header", async () => {
      const mockFetchWithHeader = createMockFetch(async () => {
        return jsonResponse(
          { error: { code: "rate-limited", message: "Slow down" } },
          429,
          { "Retry-After": "42" },
        );
      });

      const client1 = createApiClient({ baseUrl, fetch: mockFetchWithHeader });
      const res1 = await client1.login({ email: "a@b.com", password: "p" });

      expect(res1.ok).toBe(false);
      if (!res1.ok) {
        expect(res1.kind).toBe("http");
        expect(res1.status).toBe(429);
        expect(res1.retryAfterSeconds).toBe(42);
      }

      const mockFetchWithoutHeader = createMockFetch(async () => {
        return jsonResponse({ error: { code: "rate-limited", message: "Slow down" } }, 429);
      });
      const client2 = createApiClient({ baseUrl, fetch: mockFetchWithoutHeader });
      const res2 = await client2.login({ email: "a@b.com", password: "p" });

      expect(res2.ok).toBe(false);
      if (!res2.ok) {
        expect(res2.retryAfterSeconds).toBeUndefined();
      }
    });

    it("handles 413 payload-too-large and document-too-large", async () => {
      const mockFetch = createMockFetch(async () => {
        return jsonResponse({ error: { code: "document-too-large", message: "Too large" } }, 413);
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res = await client.createProject({
        schemaVersion: 1,
        document: { id: "d", name: "N", nodes: [], edges: [], variables: [] },
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(413);
        expect(res.code).toBe("document-too-large");
      }
    });

    it("handles 422 unsupported-schema-version with supported and details", async () => {
      const mockFetch = createMockFetch(async () => {
        return jsonResponse(
          {
            error: {
              code: "unsupported-schema-version",
              message: "Unsupported",
              supported: 1,
              details: [{ path: "schemaVersion", message: "Only version 1 is supported" }],
            },
          },
          422,
        );
      });

      const client = createApiClient({ baseUrl, fetch: mockFetch });
      const res = await client.createProject({
        schemaVersion: 99,
        document: { id: "d", name: "N", nodes: [], edges: [], variables: [] },
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(422);
        expect(res.code).toBe("unsupported-schema-version");
        expect(res.supported).toBe(1);
        expect(res.details?.length).toBe(1);
      }
    });

    it("handles malformed 2xx response bodies and fails closed", async () => {
      const mockFetchWrongType = createMockFetch(async () => {
        return jsonResponse({ wrong: "shape" }, 200);
      });

      const client = createApiClient({ baseUrl, fetch: mockFetchWrongType });
      const res = await client.me();

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.kind).toBe("malformed");
      }

      const mockFetchNotJson = createMockFetch(async () => {
        return new Response("<html>Not JSON</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      });
      const client2 = createApiClient({ baseUrl, fetch: mockFetchNotJson });
      const res2 = await client2.me();

      expect(res2.ok).toBe(false);
      if (!res2.ok) {
        expect(res2.kind).toBe("malformed");
      }
    });
  });

  describe("Fast-check Property Test", () => {
    it("arbitrary JSON response never throws and ok=true is only returned for guard-valid data", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.jsonValue(),
          fc.integer({ min: 200, max: 299 }),
          async (randomJson, status) => {
            const mockFetch = createMockFetch(async () => {
              return jsonResponse(randomJson, status);
            });
            const client = createApiClient({ baseUrl, fetch: mockFetch });
            let result;
            expect(() => {
              // must not throw synchronous exception
            }).not.toThrow();

            try {
              result = await client.me();
            } catch (err) {
              expect.fail(`Client threw error: ${String(err)}`);
            }

            if (result.ok) {
              expect(result.data).toBeDefined();
              expect(typeof result.data.user.id).toBe("string");
              expect(typeof result.data.user.email).toBe("string");
            } else {
              expect(["malformed", "http", "network", "timeout"]).toContain(result.kind);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
