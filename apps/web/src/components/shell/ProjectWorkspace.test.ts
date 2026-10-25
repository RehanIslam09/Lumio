import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Project } from "@repo/schema";
import { ProjectWorkspace } from "./ProjectWorkspace.js";
import { Toolbar } from "../Toolbar.js";
import { matchPath } from "../../router/router.js";
import type { ApiClient } from "../../api/client.js";
import type {
  ProjectGetResponse,
  ProjectSaveResponse,
  ProjectSummaryDto,
  VersionDto,
} from "../../api/types.js";
import { CURRENT_SCHEMA_VERSION } from "../../persistence/index.js";
import { runCloudOpen, runCloudSave } from "../../cloud/outcomes.js";
import {
  computeNextCleanMarker,
  createCleanMarker,
  isMarkerDirty,
} from "../../cloud/state.js";
import { apply, createEditor } from "../../editor/index.js";

// Valid test project fixture
const persistedProject: Project = {
  id: "client-persisted-uuid",
  name: "Echoes of the Void",
  nodes: [
    { id: "node_1", type: "start", title: "Prologue: Arrival", position: { x: 100, y: 100 } },
    { id: "node_2", type: "scene", title: "The Obsidian Gate", position: { x: 480, y: 100 } },
    { id: "node_3", type: "end", title: "Epilogue: Silence", position: { x: 860, y: 100 } },
  ],
  edges: [
    { id: "edge_1", from: "node_1", to: "node_2" },
    { id: "edge_2", from: "node_2", to: "node_3" },
  ],
  variables: [
    { id: "var_1", name: "hasKey", type: "boolean", initial: false },
  ],
};

const sampleSummary: ProjectSummaryDto = {
  id: "server-proj-uuid-1234",
  name: "Echoes of the Void",
  createdAt: "2026-10-15T09:00:00.000Z",
  updatedAt: "2026-10-25T14:30:00.000Z",
  latestVersion: 3,
};

const sampleVersion: VersionDto = {
  versionNumber: 3,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  createdAt: "2026-10-25T14:30:00.000Z",
};

function makeMockClient(overrides: Partial<ApiClient>): ApiClient {
  return {
    register: async () => ({ ok: false, kind: "network", message: "net" }),
    login: async () => ({ ok: false, kind: "network", message: "net" }),
    logout: async () => ({ ok: false, kind: "network", message: "net" }),
    me: async () => ({ ok: false, kind: "network", message: "net" }),
    listProjects: async () => ({ ok: false, kind: "network", message: "net" }),
    createProject: async () => ({ ok: false, kind: "network", message: "net" }),
    getProject: async () => ({ ok: false, kind: "network", message: "net" }),
    saveProject: async () => ({ ok: false, kind: "network", message: "net" }),
    deleteProject: async () => ({ ok: false, kind: "network", message: "net" }),
    listVersions: async () => ({ ok: false, kind: "network", message: "net" }),
    getVersion: async () => ({ ok: false, kind: "network", message: "net" }),
    ...overrides,
  };
}

describe("TASK W-037: Project Workspace URL Hydration & Persistence", () => {
  describe("1. URL-driven Project Identity & Router Matcher", () => {
    it("matches /projects/:id and extracts exact URL projectId", () => {
      const route = matchPath("/projects/server-proj-uuid-1234");
      expect(route.kind).toBe("project");
      if (route.kind === "project") {
        expect(route.projectId).toBe("server-proj-uuid-1234");
      }
    });

    it("safely decodes URI-encoded project IDs in URLs", () => {
      const route = matchPath("/projects/story%20with%20spaces%2D123");
      expect(route.kind).toBe("project");
      if (route.kind === "project") {
        expect(route.projectId).toBe("story with spaces-123");
      }
    });

    it("rejects subpaths or empty IDs under /projects/", () => {
      expect(matchPath("/projects/").kind).toBe("notFound");
      expect(matchPath("/projects/123/extra").kind).toBe("notFound");
    });

    it("keeps /editor development behavior separate from /projects/:id", () => {
      const editorRoute = matchPath("/editor");
      expect(editorRoute.kind).toBe("editor");
    });
  });

  describe("2. Project Loading Lifecycle & State Rendering", () => {
    it("renders loading skeleton with status role and aria-busy before resolution", () => {
      const html = renderToStaticMarkup(
        React.createElement(ProjectWorkspace, {
          projectId: "server-proj-uuid-1234",
        }),
      );

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain("Opening Workspace…");
      expect(html).toContain("server-proj-uuid-1234");
      expect(html).toContain("workspace-skeleton-body");
      expect(html).not.toContain("Favonius Cathedral"); // No sampleProject leakage
    });

    it("never displays sampleProject or fixture data on loading", () => {
      const html = renderToStaticMarkup(
        React.createElement(ProjectWorkspace, {
          projectId: "non-existent-story",
        }),
      );

      expect(html).not.toContain("sampleProject");
      expect(html).not.toContain("Song of Freedom");
      expect(html).not.toContain("Starsnatch Precipice");
    });

    it("successfully loads persisted project and binding via runCloudOpen", async () => {
      const client = makeMockClient({
        getProject: async (id: string) => ({
          ok: true,
          status: 200,
          data: {
            project: { ...sampleSummary, id },
            version: sampleVersion,
            document: persistedProject,
          } as ProjectGetResponse,
        }),
      });

      const outcome = await runCloudOpen({ client, projectId: "server-proj-uuid-1234" });
      expect(outcome.kind).toBe("loaded");
      if (outcome.kind === "loaded") {
        expect(outcome.project.name).toBe("Echoes of the Void");
        expect(outcome.project.nodes.length).toBe(3);
        expect(outcome.project.edges.length).toBe(2);
        expect(outcome.binding.projectId).toBe("server-proj-uuid-1234");
        expect(outcome.binding.baseVersion).toBe(3);
        expect(outcome.binding.name).toBe("Echoes of the Void");
      }
    });

    it("handles 404 Not Found as distinct inaccessible state with dashboard CTA", async () => {
      const client = makeMockClient({
        getProject: async () => ({
          ok: false,
          kind: "http",
          status: 404,
          code: "not-found",
          message: "Not found",
        }),
      });

      const outcome = await runCloudOpen({ client, projectId: "missing-id" });
      expect(outcome.kind).toBe("not-found");
    });

    it("handles 401 Unauthenticated as distinct session-expired state", async () => {
      const client = makeMockClient({
        getProject: async () => ({
          ok: false,
          kind: "http",
          status: 401,
          code: "unauthenticated",
          message: "Authentication required",
        }),
      });

      const outcome = await runCloudOpen({ client, projectId: "secret-id" });
      expect(outcome.kind).toBe("unauthenticated");
    });

    it("handles network failure and enables recoverable retry path", async () => {
      const client = makeMockClient({
        getProject: async () => ({
          ok: false,
          kind: "network",
          message: "Unable to reach server",
        }),
      });

      const outcome = await runCloudOpen({ client, projectId: "net-fail-id" });
      expect(outcome.kind).toBe("network");
    });

    it("handles invalid document / schema failure and reports details", async () => {
      const client = makeMockClient({
        getProject: async () => ({
          ok: true,
          status: 200,
          data: {
            project: sampleSummary,
            version: sampleVersion,
            document: { corrupted: true }, // invalid schema
          } as unknown as ProjectGetResponse,
        }),
      });

      const outcome = await runCloudOpen({ client, projectId: "corrupt-id" });
      expect(outcome.kind).toBe("invalid-document");
      if (outcome.kind === "invalid-document") {
        expect(outcome.details.length).toBeGreaterThan(0);
      }
    });
  });

  describe("3. Save-State Truthfulness & Persistence Feedback", () => {
    it("editing a loaded project marks it unsaved (dirty)", () => {
      const editor = createEditor(persistedProject);
      const cleanMarker = createCleanMarker(editor.present);

      expect(isMarkerDirty(editor.present, cleanMarker)).toBe(false);

      const actionResult = apply(editor, {
        type: "updateNode",
        id: "node_1",
        patch: { title: "Prologue: The Awakening" },
      });

      expect(actionResult.ok).toBe(true);
      if (actionResult.ok) {
        expect(isMarkerDirty(actionResult.state.present, cleanMarker)).toBe(true);
      }
    });

    it("renders Toolbar with 'Saving…' badge during in-flight save", () => {
      const html = renderToStaticMarkup(
        React.createElement(Toolbar, {
          projectName: "Echoes of the Void",
          binding: { projectId: "p-1", baseVersion: 3, name: "Echoes of the Void" },
          isDirty: true,
          isSaving: true,
          isSaveFailed: false,
          canUndo: false,
          canRedo: false,
          nodesCount: 3,
          edgesCount: 2,
          varsCount: 1,
          auth: { kind: "signedIn", user: { id: "u-1", email: "writer@lumio.dev" } },
          isOperationPending: true,
          onRenameProject: vi.fn(),
          onNew: vi.fn(),
          onOpen: vi.fn(),
          onSave: vi.fn(),
          onSaveCloud: vi.fn(),
          onOpenCloud: vi.fn(),
          onSignIn: vi.fn(),
          onSignOut: vi.fn(),
          onAddNode: vi.fn(),
          onUndo: vi.fn(),
          onRedo: vi.fn(),
          onReset: vi.fn(),
        }),
      );

      expect(html).toContain('role="status"');
      expect(html).toContain("Saving…");
      expect(html).not.toContain("Unsaved changes");
    });

    it("renders Toolbar with 'Save failed' badge on failure without losing local dirty edits", () => {
      const html = renderToStaticMarkup(
        React.createElement(Toolbar, {
          projectName: "Echoes of the Void",
          binding: { projectId: "p-1", baseVersion: 3, name: "Echoes of the Void" },
          isDirty: true,
          isSaving: false,
          isSaveFailed: true,
          canUndo: false,
          canRedo: false,
          nodesCount: 3,
          edgesCount: 2,
          varsCount: 1,
          auth: { kind: "signedIn", user: { id: "u-1", email: "writer@lumio.dev" } },
          isOperationPending: false,
          onRenameProject: vi.fn(),
          onNew: vi.fn(),
          onOpen: vi.fn(),
          onSave: vi.fn(),
          onSaveCloud: vi.fn(),
          onOpenCloud: vi.fn(),
          onSignIn: vi.fn(),
          onSignOut: vi.fn(),
          onAddNode: vi.fn(),
          onUndo: vi.fn(),
          onRedo: vi.fn(),
          onReset: vi.fn(),
        }),
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain("Save failed");
    });

    it("renders Toolbar with 'Saved' badge only when clean and confirmed by server", () => {
      const html = renderToStaticMarkup(
        React.createElement(Toolbar, {
          projectName: "Echoes of the Void",
          binding: { projectId: "p-1", baseVersion: 4, name: "Echoes of the Void" },
          isDirty: false,
          isSaving: false,
          isSaveFailed: false,
          canUndo: false,
          canRedo: false,
          nodesCount: 3,
          edgesCount: 2,
          varsCount: 1,
          auth: { kind: "signedIn", user: { id: "u-1", email: "writer@lumio.dev" } },
          isOperationPending: false,
          onRenameProject: vi.fn(),
          onNew: vi.fn(),
          onOpen: vi.fn(),
          onSave: vi.fn(),
          onSaveCloud: vi.fn(),
          onOpenCloud: vi.fn(),
          onSignIn: vi.fn(),
          onSignOut: vi.fn(),
          onAddNode: vi.fn(),
          onUndo: vi.fn(),
          onRedo: vi.fn(),
          onReset: vi.fn(),
        }),
      );

      expect(html).toContain("Saved");
      expect(html).toContain("Cloud · v4");
      expect(html).not.toContain("Unsaved changes");
    });

    it("concurrent edits during in-flight save remain dirty after earlier save completes", async () => {
      let resolveSave: ((val: unknown) => void) | undefined;
      const savePromise = new Promise((resolve) => {
        resolveSave = resolve;
      });

      const client = makeMockClient({
        saveProject: async () => {
          await savePromise;
          return {
            ok: true,
            status: 200,
            data: {
              project: { ...sampleSummary, latestVersion: 4 },
              version: { ...sampleVersion, versionNumber: 4 },
            } as ProjectSaveResponse,
          };
        },
      });

      const editor = createEditor(persistedProject);
      let cleanMarker = createCleanMarker(editor.present);

      // Snapshot 1 submitted to save
      const snapshot1 = editor.present;
      const saveCall = runCloudSave({
        client,
        binding: { projectId: "p-1", baseVersion: 3, name: "Echoes of the Void" },
        snapshot: snapshot1,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      });

      // User makes an edit while snapshot 1 is in-flight
      const updatedEditorResult = apply(editor, {
        type: "updateNode",
        id: "node_2",
        patch: { title: "The Shattered Gate" },
      });
      expect(updatedEditorResult.ok).toBe(true);
      const editorStateAfterEdit = updatedEditorResult.ok ? updatedEditorResult.state : editor;

      // Resolve the in-flight save for snapshot 1
      if (resolveSave) {
        resolveSave(true);
      }
      const outcome = await saveCall;
      expect(outcome.kind).toBe("saved");

      // Update clean marker to snapshot 1 (the one actually saved)
      if (outcome.kind === "saved") {
        cleanMarker = computeNextCleanMarker(outcome.snapshot);
      }

      // Assert that editorStateAfterEdit is still DIRTY because of the concurrent edit!
      expect(isMarkerDirty(editorStateAfterEdit.present, cleanMarker)).toBe(true);
    });

    it("advances cloud binding to server-confirmed version on save success", async () => {
      const client = makeMockClient({
        saveProject: async (_id, body) => ({
          ok: true,
          status: 200,
          data: {
            project: { ...sampleSummary, name: body.document.name, latestVersion: 4 },
            version: { versionNumber: 4, schemaVersion: CURRENT_SCHEMA_VERSION, createdAt: "2026-10-25T15:00:00Z" },
          },
        }),
      });

      const outcome = await runCloudSave({
        client,
        binding: { projectId: "p-1", baseVersion: 3, name: "Echoes of the Void" },
        snapshot: persistedProject,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      });

      expect(outcome.kind).toBe("saved");
      if (outcome.kind === "saved") {
        expect(outcome.version.versionNumber).toBe(4);
      }
    });

    it("preserves conflict detection when remote version has advanced (409)", async () => {
      const client = makeMockClient({
        saveProject: async () => ({
          ok: false,
          kind: "http",
          status: 409,
          code: "version-conflict",
          currentVersion: 5,
          message: "Version conflict",
        }),
      });

      const outcome = await runCloudSave({
        client,
        binding: { projectId: "p-1", baseVersion: 3, name: "Echoes of the Void" },
        snapshot: persistedProject,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      });

      expect(outcome.kind).toBe("conflict");
      if (outcome.kind === "conflict") {
        expect(outcome.currentVersion).toBe(5);
        expect(outcome.snapshot).toBe(persistedProject);
      }
    });
  });

  describe("4. Navigation Safety & Unsaved Changes Guard", () => {
    it("renders back link to /dashboard with accessible label and prompt handler", () => {
      const html = renderToStaticMarkup(
        React.createElement(Toolbar, {
          projectName: "Echoes of the Void",
          binding: { projectId: "p-1", baseVersion: 3, name: "Echoes of the Void" },
          isDirty: true,
          canUndo: false,
          canRedo: false,
          nodesCount: 3,
          edgesCount: 2,
          varsCount: 1,
          auth: { kind: "signedIn", user: { id: "u-1", email: "writer@lumio.dev" } },
          isOperationPending: false,
          onRenameProject: vi.fn(),
          onNew: vi.fn(),
          onOpen: vi.fn(),
          onSave: vi.fn(),
          onSaveCloud: vi.fn(),
          onOpenCloud: vi.fn(),
          onSignIn: vi.fn(),
          onSignOut: vi.fn(),
          onAddNode: vi.fn(),
          onUndo: vi.fn(),
          onRedo: vi.fn(),
          onReset: vi.fn(),
        }),
      );

      expect(html).toContain('href="/dashboard"');
      expect(html).toContain("← Dashboard");
      expect(html).toContain('title="Return to Dashboard"');
    });
  });
});
