import { describe, expect, it } from "vitest";
import { fetchProjectThumbnailDocument } from "./projectThumbnailClient.js";

describe("fetchProjectThumbnailDocument (A2)", () => {
  const fakeBaseUrl = "http://localhost:3000";

  it("passes signal through and returns aborted result when aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const fakeFetch: typeof globalThis.fetch = async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    };

    const res = await fetchProjectThumbnailDocument({
      baseUrl: fakeBaseUrl,
      projectId: "proj-1",
      signal: controller.signal,
      fetchFn: fakeFetch,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe("aborted");
    }
  });

  it("returns document on 200 with credentials: include and valid guard", async () => {
    let capturedOptions: RequestInit | undefined;
    let capturedUrl: string | undefined;

    const fakeFetch: typeof globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedOptions = init;
      const body = {
        project: {
          id: "proj-1",
          name: "Test",
          createdAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-10-01T00:00:00Z",
          latestVersion: 1,
        },
        version: {
          versionNumber: 1,
          schemaVersion: 2,
          createdAt: "2026-10-01T00:00:00Z",
        },
        document: {
          id: "proj-1",
          name: "Test",
          nodes: [{ id: "n1", type: "start", title: "Start" }],
          edges: [],
          variables: [],
        },
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const res = await fetchProjectThumbnailDocument({
      baseUrl: fakeBaseUrl,
      projectId: "proj-1",
      fetchFn: fakeFetch,
    });

    expect(capturedUrl).toBe("http://localhost:3000/api/projects/proj-1");
    expect(capturedOptions?.credentials).toBe("include");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.project.id).toBe("proj-1");
      const doc = res.data.document;
      if (typeof doc === "object" && doc !== null && "nodes" in doc && Array.isArray(doc.nodes)) {
        expect(doc.nodes).toHaveLength(1);
      }
    }
  });

  it("maps 401 unauthenticated correctly without throwing", async () => {
    const fakeFetch: typeof globalThis.fetch = async () => {
      const errBody = {
        error: {
          code: "unauthenticated",
          message: "Please sign in to access this project",
        },
      };
      return new Response(JSON.stringify(errBody), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    };

    const res = await fetchProjectThumbnailDocument({
      baseUrl: fakeBaseUrl,
      projectId: "proj-1",
      fetchFn: fakeFetch,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe("http");
      if (res.kind === "http") {
        expect(res.status).toBe(401);
        expect(res.code).toBe("unauthenticated");
      }
    }
  });

  it("maps 404 not-found correctly", async () => {
    const fakeFetch: typeof globalThis.fetch = async () => {
      const errBody = {
        error: {
          code: "not-found",
          message: "Project not found",
        },
      };
      return new Response(JSON.stringify(errBody), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    };

    const res = await fetchProjectThumbnailDocument({
      baseUrl: fakeBaseUrl,
      projectId: "missing",
      fetchFn: fakeFetch,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe("http");
      if (res.kind === "http") {
        expect(res.status).toBe(404);
        expect(res.code).toBe("not-found");
      }
    }
  });

  it("maps 500 internal server error correctly", async () => {
    const fakeFetch: typeof globalThis.fetch = async () => {
      return new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    };

    const res = await fetchProjectThumbnailDocument({
      baseUrl: fakeBaseUrl,
      projectId: "p500",
      fetchFn: fakeFetch,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe("http");
      if (res.kind === "http") {
        expect(res.status).toBe(500);
      }
    }
  });

  it("maps network connection failures to network error kind", async () => {
    const fakeFetch: typeof globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };

    const res = await fetchProjectThumbnailDocument({
      baseUrl: fakeBaseUrl,
      projectId: "p-net",
      fetchFn: fakeFetch,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe("network");
      expect(res.message).toContain("Network error");
    }
  });
});
