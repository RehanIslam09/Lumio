import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  matchPath,
  formatPath,
  normalizePath,
  navigate,
  safeDecodeURIComponent,
  NAVIGATE_EVENT,
} from "./router.js";
import type { Route } from "./types.js";

describe("router", () => {
  describe("normalizePath", () => {
    it("handles root and empty input safely", () => {
      expect(normalizePath("")).toBe("/");
      expect(normalizePath("/")).toBe("/");
      expect(normalizePath("   ")).toBe("/");
    });

    it("ensures leading slash", () => {
      expect(normalizePath("dashboard")).toBe("/dashboard");
    });

    it("collapses duplicate slashes", () => {
      expect(normalizePath("//projects///123")).toBe("/projects/123");
    });

    it("removes trailing slashes from non-root paths", () => {
      expect(normalizePath("/dashboard/")).toBe("/dashboard");
      expect(normalizePath("/projects/alpha/")).toBe("/projects/alpha");
    });

    it("strips query parameters and hash fragments", () => {
      expect(normalizePath("/dashboard?tab=recent")).toBe("/dashboard");
      expect(normalizePath("/editor#section1")).toBe("/editor");
      expect(normalizePath("/projects/123?foo=bar#baz")).toBe("/projects/123");
    });
  });

  describe("safeDecodeURIComponent", () => {
    it("decodes standard encoded strings", () => {
      expect(safeDecodeURIComponent("hello%20world")).toBe("hello world");
      expect(safeDecodeURIComponent("my-story-1")).toBe("my-story-1");
    });

    it("returns null for malformed percent-encoding without throwing", () => {
      expect(safeDecodeURIComponent("%E0%A4%A")).toBeNull();
      expect(safeDecodeURIComponent("%")).toBeNull();
      expect(safeDecodeURIComponent("%zz")).toBeNull();
    });
  });

  describe("matchPath (Static routes)", () => {
    it("matches landing route at /", () => {
      expect(matchPath("/")).toEqual({ kind: "landing" });
    });

    it("matches login route at /login", () => {
      expect(matchPath("/login")).toEqual({ kind: "login" });
      expect(matchPath("/login/")).toEqual({ kind: "login" });
    });

    it("matches register route at /register", () => {
      expect(matchPath("/register")).toEqual({ kind: "register" });
      expect(matchPath("/register/")).toEqual({ kind: "register" });
    });

    it("matches dashboard route at /dashboard", () => {
      expect(matchPath("/dashboard")).toEqual({ kind: "dashboard" });
      expect(matchPath("/dashboard/")).toEqual({ kind: "dashboard" });
    });

    it("matches development editor route at /editor", () => {
      expect(matchPath("/editor")).toEqual({ kind: "editor" });
      expect(matchPath("/editor/")).toEqual({ kind: "editor" });
    });
  });

  describe("matchPath (Parameterized /projects/:id)", () => {
    it("extracts valid UUID project IDs", () => {
      const uuid = "e7492c7d-3098-4c07-9ea8-d621648a313b";
      expect(matchPath(`/projects/${uuid}`)).toEqual({
        kind: "project",
        projectId: uuid,
      });
    });

    it("extracts alphanumeric and slug project IDs", () => {
      expect(matchPath("/projects/my-story-v1")).toEqual({
        kind: "project",
        projectId: "my-story-v1",
      });
    });

    it("decodes URL-encoded project IDs", () => {
      expect(matchPath("/projects/story%20one")).toEqual({
        kind: "project",
        projectId: "story one",
      });
    });

    it("returns notFound for missing or empty project ID", () => {
      expect(matchPath("/projects")).toEqual({ kind: "notFound", path: "/projects" });
      expect(matchPath("/projects/")).toEqual({ kind: "notFound", path: "/projects/" });
      expect(matchPath("/projects/   ")).toEqual({ kind: "notFound", path: "/projects/   " });
    });

    it("returns notFound for malformed percent-encoding in project ID", () => {
      expect(matchPath("/projects/%E0%A4%A")).toEqual({
        kind: "notFound",
        path: "/projects/%E0%A4%A",
      });
    });

    it("returns notFound for nested paths beyond :id", () => {
      expect(matchPath("/projects/123/edit")).toEqual({
        kind: "notFound",
        path: "/projects/123/edit",
      });
    });
  });

  describe("matchPath (Unknown routes)", () => {
    it("returns notFound for unknown top-level and nested paths", () => {
      expect(matchPath("/unknown")).toEqual({ kind: "notFound", path: "/unknown" });
      expect(matchPath("/api/projects")).toEqual({ kind: "notFound", path: "/api/projects" });
      expect(matchPath("/about/team")).toEqual({ kind: "notFound", path: "/about/team" });
    });
  });

  describe("formatPath", () => {
    it("formats all route kinds correctly", () => {
      expect(formatPath({ kind: "landing" })).toBe("/");
      expect(formatPath({ kind: "login" })).toBe("/login");
      expect(formatPath({ kind: "register" })).toBe("/register");
      expect(formatPath({ kind: "dashboard" })).toBe("/dashboard");
      expect(formatPath({ kind: "editor" })).toBe("/editor");
      expect(formatPath({ kind: "project", projectId: "p-123" })).toBe("/projects/p-123");
      expect(formatPath({ kind: "project", projectId: "story one" })).toBe(
        "/projects/story%20one",
      );
      expect(formatPath({ kind: "notFound", path: "/bad" })).toBe("/bad");
    });

    it("round-trips standard routes with matchPath", () => {
      const routes: Route[] = [
        { kind: "landing" },
        { kind: "login" },
        { kind: "register" },
        { kind: "dashboard" },
        { kind: "editor" },
        { kind: "project", projectId: "abc-xyz" },
      ];

      for (const route of routes) {
        const path = formatPath(route);
        expect(matchPath(path)).toEqual(route);
      }
    });
  });

  describe("navigate helper and environment safety", () => {
    it("no-ops safely in non-browser environment without throwing", () => {
      const originalWindow = (globalThis as unknown as { window?: unknown }).window;
      delete (globalThis as unknown as { window?: unknown }).window;

      expect(() => navigate("/dashboard")).not.toThrow();

      if (originalWindow !== undefined) {
        (globalThis as unknown as { window?: unknown }).window = originalWindow;
      }
    });

    describe("with mocked window", () => {
      let pushStateMock: ReturnType<typeof vi.fn>;
      let replaceStateMock: ReturnType<typeof vi.fn>;
      let dispatchEventMock: ReturnType<typeof vi.fn>;
      let addEventListenerMock: ReturnType<typeof vi.fn>;
      let removeEventListenerMock: ReturnType<typeof vi.fn>;

      beforeEach(() => {
        pushStateMock = vi.fn();
        replaceStateMock = vi.fn();
        dispatchEventMock = vi.fn();
        addEventListenerMock = vi.fn();
        removeEventListenerMock = vi.fn();

        (globalThis as unknown as { window: unknown }).window = {
          location: { pathname: "/" },
          history: {
            pushState: pushStateMock,
            replaceState: replaceStateMock,
          },
          dispatchEvent: dispatchEventMock,
          addEventListener: addEventListenerMock,
          removeEventListener: removeEventListenerMock,
        };
      });

      afterEach(() => {
        delete (globalThis as unknown as { window?: unknown }).window;
        vi.restoreAllMocks();
      });

      it("calls pushState and dispatches custom navigate event on route change", () => {
        navigate("/dashboard");

        expect(pushStateMock).toHaveBeenCalledWith(null, "", "/dashboard");
        expect(dispatchEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            type: NAVIGATE_EVENT,
            detail: { path: "/dashboard" },
          }),
        );
      });

      it("calls replaceState when options.replace is true", () => {
        navigate("/login", { replace: true });

        expect(replaceStateMock).toHaveBeenCalledWith(null, "", "/login");
        expect(pushStateMock).not.toHaveBeenCalled();
      });

      it("accepts a Route object directly", () => {
        navigate({ kind: "project", projectId: "456" });

        expect(pushStateMock).toHaveBeenCalledWith(null, "", "/projects/456");
      });

      it("avoids redundant pushState when navigating to current path without replace", () => {
        (globalThis as unknown as { window: { location: { pathname: string } } }).window.location.pathname =
          "/dashboard";

        navigate("/dashboard");

        expect(pushStateMock).not.toHaveBeenCalled();
        expect(dispatchEventMock).not.toHaveBeenCalled();
      });

      it("allows replaceState to current path when replace is requested", () => {
        (globalThis as unknown as { window: { location: { pathname: string } } }).window.location.pathname =
          "/dashboard";

        navigate("/dashboard", { replace: true });

        expect(replaceStateMock).toHaveBeenCalledWith(null, "", "/dashboard");
        expect(dispatchEventMock).toHaveBeenCalled();
      });
    });
  });
});
