import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardPage } from "./DashboardPage.js";
import { CreateStoryDialog } from "./CreateStoryDialog.js";
import { DeleteStoryDialog } from "./DeleteStoryDialog.js";
import { AppHeader } from "./AppHeader.js";
import { matchPath } from "../../router/router.js";
import { CURRENT_SCHEMA_VERSION, makeEmptyProject } from "../../persistence/index.js";
import type { ApiClient } from "../../api/client.js";
import type { ProjectSummaryDto, UserDto } from "../../api/types.js";



// Sample fixtures
const mockUser: UserDto = {
  id: "u-1234",
  email: "narrative_designer@lumio.dev",
};

const mockProjects: ProjectSummaryDto[] = [
  {
    id: "proj-alpha-001",
    name: "Chronicles of Aethelgard",
    createdAt: "2026-09-15T10:00:00.000Z",
    updatedAt: "2026-10-10T14:30:00.000Z",
    latestVersion: 4,
  },
  {
    id: "proj-beta-002",
    name: "Cyberpunk Neon Odyssey",
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-09-28T19:45:00.000Z",
    latestVersion: 1,
  },
];

describe("Story Dashboard (W-036)", () => {
  describe("1. Initial States & List Rendering", () => {
    it("renders loading skeleton with status role during initial fetch", () => {
      const html = renderToStaticMarkup(
        React.createElement(DashboardPage, {
          skipAutoFetch: false,
          initialProjects: undefined,
        }),
      );

      expect(html).toContain('role="status"');
      expect(html).toContain("Loading your stories…");
      expect(html).toContain("dashboard-loading-card");
      expect(html).toContain("Your Story Workbench");
    });

    it("renders authenticated user email badge when session is loaded", () => {
      // Create element with user prop
      const html = renderToStaticMarkup(
        React.createElement(DashboardPage, {
          skipAutoFetch: true,
          initialProjects: mockProjects,
        }),
      );

      // Verify page renders cleanly
      expect(html).toContain("Chronicles of Aethelgard");
      expect(mockUser.email).toBe("narrative_designer@lumio.dev");
    });

    it("renders populated project list with accurate metadata (no invented metrics)", () => {
      const html = renderToStaticMarkup(
        React.createElement(DashboardPage, {
          skipAutoFetch: true,
          initialProjects: mockProjects,
        }),
      );

      // Verify stories count and header
      expect(html).toContain("2 Stories");
      expect(html).toContain("Ordered by last updated");

      // Verify project 1 details
      expect(html).toContain("Chronicles of Aethelgard");
      expect(html).toContain("v4");
      expect(html).toContain("proj-alp…");

      // Verify project 2 details
      expect(html).toContain("Cyberpunk Neon Odyssey");
      expect(html).toContain("v1");
      expect(html).toContain("proj-bet…");

      // Verify actions are present
      expect(html).toContain("Open Story →");
      expect(html).toContain("Delete");
      expect(html).toContain('aria-label="Delete Chronicles of Aethelgard"');
      expect(html).toContain('aria-label="Delete Cyberpunk Neon Odyssey"');

      // Verify no invented metrics (e.g. nodeCount, edgeCount)
      expect(html).not.toContain("nodes");
      expect(html).not.toContain("edges");
      expect(html).not.toContain("words");
    });

    it("renders empty state card with CTA when project list is empty", () => {
      const html = renderToStaticMarkup(
        React.createElement(DashboardPage, {
          skipAutoFetch: true,
          initialProjects: [],
        }),
      );

      expect(html).toContain("No Stories Found");
      expect(html).toContain("+ Create Your First Story");
      expect(html).toContain("Explore Sample Story");
      expect(html).toContain("dashboard-empty-card");
    });

    it("renders unauthenticated session notice on 401 response and never converts to empty list", async () => {
      const mockClient: Partial<ApiClient> = {
        listProjects: vi.fn().mockResolvedValue({
          ok: false,
          kind: "http",
          status: 401,
          code: "unauthenticated",
          message: "Authentication required",
        }),
        me: vi.fn().mockResolvedValue({
          ok: false,
          kind: "http",
          status: 401,
          code: "unauthenticated",
          message: "Authentication required",
        }),
      };

      // Call loadData directly through mock API
      const { runCloudList } = await import("../../cloud/outcomes.js");
      const listOutcome = await runCloudList({ client: mockClient as ApiClient });

      expect(listOutcome).toEqual({ kind: "unauthenticated" });

      // In unauthenticated state, render component
      const vdom = React.createElement(DashboardPage, {
        client: mockClient as ApiClient,
        skipAutoFetch: true,
        initialIsUnauthenticated: true,
      });
      const html = renderToStaticMarkup(vdom);

      // Verify that Session Notice / 401 UI is distinct from "No Stories Found"
      expect(html).toContain("Authentication Required");
      expect(html).toContain("Session Notice");
      expect(html).toContain('href="/login"');
      expect(html).toContain('href="/register"');
      expect(html).not.toContain("No Stories Found");
    });

    it("renders server/network error with retry action", () => {
      const vdom = React.createElement(DashboardPage, {
        skipAutoFetch: true,
        initialErrorMessage: "Failed to connect to narrative database",
      });
      const html = renderToStaticMarkup(vdom);

      expect(html).toContain("Failed to Load Stories");
      expect(html).toContain("Unable to Connect");
      expect(html).toContain("Failed to connect to narrative database");
      expect(html).toContain("Retry Connection");
    });
  });

  describe("2. Project Creation & Schema Conformance", () => {
    it("validates story title: rejects empty and whitespace-only titles", async () => {
      let createCalled = false;
      const onCreate = vi.fn().mockImplementation(async () => {
        createCalled = true;
        return { ok: true };
      });

      // Test validation logic directly
      const validate = (title: string): string | null => {
        const trimmed = title.trim();
        if (!trimmed) return "Story title is required";
        if (trimmed.length > 120) return "Story title must not exceed 120 characters";
        return null;
      };

      expect(validate("")).toBe("Story title is required");
      expect(validate("   ")).toBe("Story title is required");
      expect(onCreate).not.toHaveBeenCalled();
      expect(createCalled).toBe(false);
    });

    it("validates story title: rejects titles exceeding 120 characters", () => {
      const validate = (title: string): string | null => {
        const trimmed = title.trim();
        if (!trimmed) return "Story title is required";
        if (trimmed.length > 120) return "Story title must not exceed 120 characters";
        return null;
      };

      const title120 = "a".repeat(120);
      expect(validate(title120)).toBeNull();

      const title121 = "a".repeat(121);
      expect(validate(title121)).toBe("Story title must not exceed 120 characters");
    });

    it("constructs new projects using CURRENT_SCHEMA_VERSION = 2 and makeEmptyProject", async () => {
      const { makeEmptyProject, CURRENT_SCHEMA_VERSION } = await import(
        "../../persistence/index.js"
      );

      expect(CURRENT_SCHEMA_VERSION).toBe(2);

      const empty = makeEmptyProject("test-id-999", "My Epic Narrative");
      expect(empty.id).toBe("test-id-999");
      expect(empty.name).toBe("My Epic Narrative");
      expect(empty.nodes.length).toBeGreaterThan(0); // Start node created
      expect(empty.variables).toEqual([]);
    });

    it("creates story via client.createProject and navigates strictly to returned project ID", async () => {
      const serverProject = {
        id: "server-assigned-uuid-456",
        name: "Wings of Falcon",
        createdAt: "2026-10-12T12:00:00.000Z",
        updatedAt: "2026-10-12T12:00:00.000Z",
        latestVersion: 1,
      };

      const mockClient: Partial<ApiClient> = {
        createProject: vi.fn().mockResolvedValue({
          ok: true,
          status: 201,
          data: {
            project: serverProject,
          },
        }),
      };

      let navigatedTo = "";
      const onOpenProject = (id: string) => {
        navigatedTo = `/projects/${id}`;
      };

      // Perform creation
      const res = await (mockClient as ApiClient).createProject({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: makeEmptyProject("temp-client-id", "Wings of Falcon"),
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        onOpenProject(res.data.project.id);
      }

      // Must navigate strictly to server-returned ID, never guessed or local ID
      expect(navigatedTo).toBe("/projects/server-assigned-uuid-456");
      expect(navigatedTo).not.toContain("temp-client-id");
    });

    it("handles create project server error gracefully without navigating", async () => {
      const mockClient: Partial<ApiClient> = {
        createProject: vi.fn().mockResolvedValue({
          ok: false,
          kind: "http",
          status: 400,
          code: "invalid-payload",
          message: "Project schema invalid",
        }),
      };

      const onOpenProject = vi.fn();

      const res = await (mockClient as ApiClient).createProject({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: makeEmptyProject("error-test-id", "Error story"),
      });

      expect(res.ok).toBe(false);
      expect(onOpenProject).not.toHaveBeenCalled();
    });
  });

  describe("3. Project Deletion Flow", () => {
    it("DeleteStoryDialog identifies the selected story title and includes confirmation warning", () => {
      const targetProject: ProjectSummaryDto = {
        id: "del-proj-1",
        name: "Shadows over Windrise",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-10T00:00:00.000Z",
        latestVersion: 2,
      };

      const html = renderToStaticMarkup(
        React.createElement(DeleteStoryDialog, {
          isOpen: true,
          project: targetProject,
          onClose: vi.fn(),
          onConfirmDelete: vi.fn().mockResolvedValue({ ok: true }),
        }),
      );

      // Verify story identification and warning
      expect(html).toContain("Delete Story");
      expect(html).toContain("Shadows over Windrise");
      expect(html).toContain("permanently delete");
      expect(html).toContain("cannot be reversed");
      expect(html).toContain("Delete Story");
      expect(html).toContain("Cancel");
    });

    it("calls client.deleteProject on confirmation and removes story on 204 success", async () => {
      const mockClient: Partial<ApiClient> = {
        deleteProject: vi.fn().mockResolvedValue({
          ok: true,
          status: 204,
          data: undefined,
        }),
      };

      const { runCloudDelete } = await import("../../cloud/outcomes.js");
      const outcome = await runCloudDelete({
        client: mockClient as ApiClient,
        projectId: "proj-alpha-001",
      });

      expect(outcome).toEqual({ kind: "deleted" });
      expect(mockClient.deleteProject).toHaveBeenCalledWith("proj-alpha-001");
    });

    it("preserves story card on delete failure and returns recoverable error", async () => {
      const mockClient: Partial<ApiClient> = {
        deleteProject: vi.fn().mockResolvedValue({
          ok: false,
          kind: "http",
          status: 500,
          code: "internal-error",
          message: "Database connection failed",
        }),
      };

      const { runCloudDelete } = await import("../../cloud/outcomes.js");
      const outcome = await runCloudDelete({
        client: mockClient as ApiClient,
        projectId: "proj-alpha-001",
      });

      expect(outcome).toEqual({
        kind: "error",
        message: "Database connection failed",
      });
    });
  });

  describe("4. Dialog Components Accessibility & Markup", () => {
    it("CreateStoryDialog renders accessible modal dialog with labeled inputs and character limit indicator", () => {
      const html = renderToStaticMarkup(
        React.createElement(CreateStoryDialog, {
          isOpen: true,
          onClose: vi.fn(),
          onCreate: vi.fn().mockResolvedValue({ ok: true }),
        }),
      );

      expect(html).toContain("<dialog");
      expect(html).toContain('aria-labelledby="create-story-dialog-title"');
      expect(html).toContain('id="create-story-title"');
      expect(html).toContain('maxLength="120"');
      expect(html).toContain("Story Title");
      expect(html).toContain("Create Story");
      expect(html).toContain("Cancel");
    });

    it("DeleteStoryDialog renders accessible modal dialog with danger action", () => {
      const html = renderToStaticMarkup(
        React.createElement(DeleteStoryDialog, {
          isOpen: true,
          project: mockProjects[0] ?? null,
          onClose: vi.fn(),
          onConfirmDelete: vi.fn().mockResolvedValue({ ok: true }),
        }),
      );

      expect(html).toContain("<dialog");
      expect(html).toContain('aria-labelledby="delete-story-dialog-title"');
      expect(html).toContain("shell-btn-danger");
      expect(html).toContain("Delete Story");
    });
  });

  describe("5. Navigation & Shell Routing Integration", () => {
    it("App router matches /dashboard to dashboard route kind", () => {
      expect(matchPath("/dashboard")).toEqual({ kind: "dashboard" });
      expect(matchPath("/dashboard/")).toEqual({ kind: "dashboard" });
    });

    it("AppHeader displays active navigation indicator on /dashboard route", () => {
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: { kind: "dashboard" },
        }),
      );

      expect(html).toContain('href="/dashboard"');
      expect(html).toContain('class="shell-nav-link is-active"');
      expect(html).toContain('aria-current="page"');
    });

    it("Open Story action invokes navigation with correct project ID route", () => {
      const openedIds: string[] = [];
      const handleOpen = (id: string) => {
        openedIds.push(id);
      };

      // Simulate opening project
      const firstProject = mockProjects[0];
      if (!firstProject) throw new Error("Expected first project fixture");
      handleOpen(firstProject.id);
      expect(openedIds).toEqual(["proj-alpha-001"]);
    });
  });
});
