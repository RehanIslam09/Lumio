import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, type Project } from "@repo/schema";
import type { ApiClient } from "../api/client.js";
import {
  runCloudSave,
  runCloudSaveOverwrite,
  runCloudList,
  runCloudOpen,
  runCloudDelete,
  runCloudListVersions,
  runCloudFetchVersion,
  runAuthRegister,
  runAuthLogin,
  runAuthLogout,
  runAuthMe,
} from "./outcomes.js";

describe("Cloud Outcomes controllers", () => {
  const sampleProject: Project = {
    id: "local-client-id",
    name: "Sample Project",
    nodes: [
      { id: "node-1", type: "start", title: "Start" },
      { id: "node-2", type: "end", title: "End" },
    ],
    edges: [{ id: "edge-1", from: "node-1", to: "node-2" }],
    variables: [],
  };

  const sampleSummary = {
    id: "cloud-proj-1",
    name: "Sample Project",
    createdAt: "2026-10-05T00:00:00Z",
    updatedAt: "2026-10-05T00:00:00Z",
    latestVersion: 1,
  };

  const sampleVersion = {
    versionNumber: 1,
    schemaVersion: 1,
    createdAt: "2026-10-05T00:00:00Z",
  };

  function makeClient(overrides: Partial<ApiClient>): ApiClient {
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

  describe("runCloudSave & runCloudSaveOverwrite", () => {
    it("creates a new project when binding is null and preserves snapshot identity", async () => {
      let passedBody: unknown;
      const client = makeClient({
        createProject: async (body) => {
          passedBody = body;
          return {
            ok: true,
            status: 201,
            data: { project: sampleSummary, version: sampleVersion },
          };
        },
      });

      const outcome = await runCloudSave({
        client,
        binding: null,
        snapshot: sampleProject,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      });

      expect(outcome.kind).toBe("created");
      if (outcome.kind === "created") {
        expect(outcome.snapshot).toBe(sampleProject); // Identity check
        expect(outcome.project.id).toBe("cloud-proj-1");
      }
      expect(passedBody).toEqual({ schemaVersion: CURRENT_SCHEMA_VERSION, document: sampleProject });
    });

    it("saves existing project when binding is present", async () => {
      let passedId = "";
      let passedBody: unknown;
      const client = makeClient({
        saveProject: async (id, body) => {
          passedId = id;
          passedBody = body;
          return {
            ok: true,
            status: 200,
            data: {
              project: { ...sampleSummary, latestVersion: 2 },
              version: { ...sampleVersion, versionNumber: 2 },
            },
          };
        },
      });

      const outcome = await runCloudSave({
        client,
        binding: { projectId: "cloud-proj-1", baseVersion: 1, name: "Sample Project" },
        snapshot: sampleProject,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      });

      expect(outcome.kind).toBe("saved");
      if (outcome.kind === "saved") {
        expect(outcome.snapshot).toBe(sampleProject);
        expect(outcome.version.versionNumber).toBe(2);
      }
      expect(passedId).toBe("cloud-proj-1");
      expect(passedBody).toEqual({ baseVersion: 1, schemaVersion: CURRENT_SCHEMA_VERSION, document: sampleProject });
    });

    it("returns conflict outcome with currentVersion on 409", async () => {
      const client = makeClient({
        saveProject: async () => ({
          ok: false,
          kind: "http",
          status: 409,
          code: "version-conflict",
          message: "Conflict",
          currentVersion: 4,
        }),
      });

      const outcome = await runCloudSave({
        client,
        binding: { projectId: "cloud-proj-1", baseVersion: 1, name: "Sample Project" },
        snapshot: sampleProject,
        schemaVersion: 1,
      });

      expect(outcome.kind).toBe("conflict");
      if (outcome.kind === "conflict") {
        expect(outcome.currentVersion).toBe(4);
        expect(outcome.snapshot).toBe(sampleProject);
      }
    });

    it("handles conflict then overwrite success with baseVersion replaced by currentVersion", async () => {
      let sentBaseVersion = -1;
      const client = makeClient({
        saveProject: async (_id, body) => {
          sentBaseVersion = body.baseVersion;
          return {
            ok: true,
            status: 200,
            data: {
              project: { ...sampleSummary, latestVersion: 5 },
              version: { ...sampleVersion, versionNumber: 5 },
            },
          };
        },
      });

      const outcome = await runCloudSaveOverwrite({
        client,
        binding: { projectId: "cloud-proj-1", baseVersion: 1, name: "Sample Project" },
        currentVersion: 4,
        snapshot: sampleProject,
        schemaVersion: 1,
      });

      expect(outcome.kind).toBe("saved");
      expect(sentBaseVersion).toBe(4);
    });

    it("handles conflict then a second conflict", async () => {
      const client = makeClient({
        saveProject: async () => ({
          ok: false,
          kind: "http",
          status: 409,
          code: "version-conflict",
          message: "Conflict again",
          currentVersion: 6,
        }),
      });

      const outcome = await runCloudSaveOverwrite({
        client,
        binding: { projectId: "cloud-proj-1", baseVersion: 1, name: "Sample Project" },
        currentVersion: 4,
        snapshot: sampleProject,
        schemaVersion: 1,
      });

      expect(outcome.kind).toBe("conflict");
      if (outcome.kind === "conflict") {
        expect(outcome.currentVersion).toBe(6);
      }
    });

    it("returns not-found on 404 when saving bound project", async () => {
      const client = makeClient({
        saveProject: async () => ({
          ok: false,
          kind: "http",
          status: 404,
          code: "not-found",
          message: "Not found",
        }),
      });

      const outcome = await runCloudSave({
        client,
        binding: { projectId: "p-deleted", baseVersion: 1, name: "Sample Project" },
        snapshot: sampleProject,
        schemaVersion: 1,
      });

      expect(outcome.kind).toBe("not-found");
    });

    it("returns unauthenticated on 401 mid-flow", async () => {
      const client = makeClient({
        createProject: async () => ({
          ok: false,
          kind: "http",
          status: 401,
          code: "unauthenticated",
          message: "Auth required",
        }),
      });

      const outcome = await runCloudSave({
        client,
        binding: null,
        snapshot: sampleProject,
        schemaVersion: 1,
      });

      expect(outcome.kind).toBe("unauthenticated");
    });
  });

  describe("runCloudOpen", () => {
    it("returns loaded with warnings for document with stripped unknown keys", async () => {
      const docWithExtra = {
        ...sampleProject,
        extraRootKey: "ignored",
      };

      const client = makeClient({
        getProject: async () => ({
          ok: true,
          status: 200,
          data: {
            project: sampleSummary,
            version: sampleVersion,
            document: docWithExtra,
          },
        }),
      });

      const outcome = await runCloudOpen({ client, projectId: "cloud-proj-1" });

      expect(outcome.kind).toBe("loaded");
      if (outcome.kind === "loaded") {
        expect(outcome.binding).toEqual({
          projectId: "cloud-proj-1",
          baseVersion: 1,
          name: "Sample Project",
        });
        expect(outcome.warnings.length).toBeGreaterThan(0);
        expect(outcome.warnings[0]).toMatch(/unknown project properties/i);
      }
    });

    it("returns invalid-document and NEVER becomes loaded if document fails integrity", async () => {
      const brokenDoc = {
        ...sampleProject,
        edges: [{ id: "edge-bad", from: "missing-1", to: "missing-2" }],
      };

      const client = makeClient({
        getProject: async () => ({
          ok: true,
          status: 200,
          data: {
            project: sampleSummary,
            version: sampleVersion,
            document: brokenDoc,
          },
        }),
      });

      const outcome = await runCloudOpen({ client, projectId: "cloud-proj-1" });

      expect(outcome.kind).toBe("invalid-document");
      if (outcome.kind === "invalid-document") {
        expect(outcome.details.some((d) => d.includes("missing source node"))).toBe(true);
      }
    });

    it("returns unsupported-schema if version is above current", async () => {
      const client = makeClient({
        getProject: async () => ({
          ok: true,
          status: 200,
          data: {
            project: sampleSummary,
            version: { ...sampleVersion, schemaVersion: 99 },
            document: sampleProject,
          },
        }),
      });

      const outcome = await runCloudOpen({ client, projectId: "cloud-proj-1" });

      expect(outcome.kind).toBe("unsupported-schema");
    });

    it("migrates v1 document to v2 with entities: [] when opening project", async () => {
      const v1RawDoc = {
        id: "v1-id",
        name: "V1 Project",
        nodes: [
          { id: "node-1", type: "start", title: "Start" },
          { id: "node-2", type: "end", title: "End" },
        ],
        edges: [{ id: "edge-1", from: "node-1", to: "node-2" }],
        variables: [],
      };
      const client = makeClient({
        getProject: async () => ({
          ok: true,
          status: 200,
          data: {
            project: sampleSummary,
            version: { ...sampleVersion, schemaVersion: 1 },
            document: v1RawDoc as unknown as Project,
          },
        }),
      });

      const outcome = await runCloudOpen({ client, projectId: "cloud-proj-1" });
      expect(outcome.kind).toBe("loaded");
      if (outcome.kind === "loaded") {
        expect(outcome.project.entities).toEqual([]);
      }
    });
  });

  describe("runCloudDelete", () => {
    it("returns deleted on 204", async () => {
      const client = makeClient({
        deleteProject: async () => ({ ok: true, status: 204, data: undefined }),
      });

      const outcome = await runCloudDelete({ client, projectId: "cloud-proj-1" });
      expect(outcome.kind).toBe("deleted");
    });

    it("returns not-found on 404", async () => {
      const client = makeClient({
        deleteProject: async () => ({
          ok: false,
          kind: "http",
          status: 404,
          code: "not-found",
          message: "Not found",
        }),
      });

      const outcome = await runCloudDelete({ client, projectId: "cloud-proj-1" });
      expect(outcome.kind).toBe("not-found");
    });
  });

  describe("runCloudList", () => {
    it("returns listed projects on success", async () => {
      const client = makeClient({
        listProjects: async () => ({
          ok: true,
          status: 200,
          data: { projects: [sampleSummary] },
        }),
      });

      const outcome = await runCloudList({ client });
      expect(outcome.kind).toBe("listed");
      if (outcome.kind === "listed") {
        expect(outcome.projects.length).toBe(1);
        expect(outcome.projects[0]?.name).toBe("Sample Project");
      }
    });
  });

  describe("runAuth helpers", () => {
    it("never stores the password in an outcome", async () => {
      const client = makeClient({
        register: async () => ({
          ok: true,
          status: 201,
          data: { user: { id: "u-1", email: "user@test.com" } },
        }),
      });

      const outcome = await runAuthRegister({
        client,
        email: "user@test.com",
        password: "SuperSecretPassword123!",
      });

      expect(outcome.kind).toBe("signed-in");
      if (outcome.kind === "signed-in") {
        expect(outcome.user).toEqual({ id: "u-1", email: "user@test.com" });
        expect(JSON.stringify(outcome)).not.toContain("SuperSecretPassword123!");
      }
    });

    it("handles login outcome", async () => {
      const client = makeClient({
        login: async () => ({
          ok: true,
          status: 200,
          data: { user: { id: "u-2", email: "login@test.com" } },
        }),
      });

      const outcome = await runAuthLogin({
        client,
        email: "login@test.com",
        password: "Password123!",
      });

      expect(outcome.kind).toBe("signed-in");
      if (outcome.kind === "signed-in") {
        expect(outcome.user.email).toBe("login@test.com");
      }
    });

    it("handles logout outcome", async () => {
      const client = makeClient({
        logout: async () => ({ ok: true, status: 204, data: undefined }),
      });

      const outcome = await runAuthLogout({ client });
      expect(outcome.kind).toBe("anonymous");
    });

    it("returns anonymous on 401 for me", async () => {
      const client = makeClient({
        me: async () => ({
          ok: false,
          kind: "http",
          status: 401,
          code: "unauthenticated",
          message: "Auth required",
        }),
      });

      const outcome = await runAuthMe({ client });
      expect(outcome.kind).toBe("anonymous");
    });
  });

  describe("runCloudListVersions", () => {
    it("returns listed on success", async () => {
      const client = makeClient({
        listVersions: async () => ({
          ok: true,
          status: 200,
          data: {
            versions: [
              {
                versionNumber: 2,
                schemaVersion: 1,
                createdAt: "2026-10-06T10:00:00Z",
                createdByMe: true,
              },
            ],
          },
        }),
      });

      const outcome = await runCloudListVersions({ client, projectId: "cloud-proj-1" });
      expect(outcome.kind).toBe("listed");
      if (outcome.kind === "listed") {
        expect(outcome.versions).toHaveLength(1);
        expect(outcome.versions[0]?.versionNumber).toBe(2);
      }
    });

    it("returns not-found on 404", async () => {
      const client = makeClient({
        listVersions: async () => ({
          ok: false,
          kind: "http",
          status: 404,
          code: "not-found",
          message: "Not found",
        }),
      });

      const outcome = await runCloudListVersions({ client, projectId: "missing" });
      expect(outcome.kind).toBe("not-found");
    });

    it("returns unauthenticated on 401", async () => {
      const client = makeClient({
        listVersions: async () => ({
          ok: false,
          kind: "http",
          status: 401,
          code: "unauthenticated",
          message: "Unauthenticated",
        }),
      });

      const outcome = await runCloudListVersions({ client, projectId: "cloud-proj-1" });
      expect(outcome.kind).toBe("unauthenticated");
    });

    it("returns network on network failure", async () => {
      const client = makeClient({
        listVersions: async () => ({ ok: false, kind: "network", message: "Network error" }),
      });

      const outcome = await runCloudListVersions({ client, projectId: "cloud-proj-1" });
      expect(outcome.kind).toBe("network");
    });

    it("returns timeout on timeout", async () => {
      const client = makeClient({
        listVersions: async () => ({ ok: false, kind: "timeout", message: "Timeout" }),
      });

      const outcome = await runCloudListVersions({ client, projectId: "cloud-proj-1" });
      expect(outcome.kind).toBe("timeout");
    });

    it("returns error on other errors", async () => {
      const client = makeClient({
        listVersions: async () => ({
          ok: false,
          kind: "http",
          status: 500,
          code: "server-error",
          message: "Internal server error",
        }),
      });

      const outcome = await runCloudListVersions({ client, projectId: "cloud-proj-1" });
      expect(outcome.kind).toBe("error");
      if (outcome.kind === "error") {
        expect(outcome.message).toBe("Internal server error");
      }
    });
  });

  describe("runCloudFetchVersion", () => {
    it("returns loaded with version and validated document on success", async () => {
      const client = makeClient({
        getVersion: async () => ({
          ok: true,
          status: 200,
          data: {
            version: sampleVersion,
            document: sampleProject,
          },
        }),
      });

      const outcome = await runCloudFetchVersion({ client, projectId: "cloud-proj-1", versionNumber: 1 });
      expect(outcome.kind).toBe("loaded");
      if (outcome.kind === "loaded") {
        expect(outcome.version.versionNumber).toBe(1);
        expect(outcome.project.name).toBe(sampleProject.name);
        expect(outcome.warnings).toEqual([]);
      }
    });

    it("returns invalid-document when document fails validation", async () => {
      const client = makeClient({
        getVersion: async () => ({
          ok: true,
          status: 200,
          data: {
            version: sampleVersion,
            document: { id: "bad", missing: "everything" },
          },
        }),
      });

      const outcome = await runCloudFetchVersion({ client, projectId: "cloud-proj-1", versionNumber: 1 });
      expect(outcome.kind).toBe("invalid-document");
      if (outcome.kind === "invalid-document") {
        expect(outcome.details.length).toBeGreaterThan(0);
      }
    });

    it("returns unsupported-schema when schemaVersion is greater than CURRENT_SCHEMA_VERSION", async () => {
      const client = makeClient({
        getVersion: async () => ({
          ok: true,
          status: 200,
          data: {
            version: { ...sampleVersion, schemaVersion: 3 },
            document: sampleProject,
          },
        }),
      });

      const outcome = await runCloudFetchVersion({ client, projectId: "cloud-proj-1", versionNumber: 1 });
      expect(outcome.kind).toBe("unsupported-schema");
      if (outcome.kind === "unsupported-schema") {
        expect(outcome.supported).toBe(CURRENT_SCHEMA_VERSION);
      }
    });

    it("migrates v1 document to v2 with entities: [] when fetching version", async () => {
      const v1RawDoc = {
        id: "v1-id",
        name: "V1 Project",
        nodes: [
          { id: "node-1", type: "start", title: "Start" },
          { id: "node-2", type: "end", title: "End" },
        ],
        edges: [{ id: "edge-1", from: "node-1", to: "node-2" }],
        variables: [],
      };
      const client = makeClient({
        getVersion: async () => ({
          ok: true,
          status: 200,
          data: {
            version: { ...sampleVersion, schemaVersion: 1 },
            document: v1RawDoc as unknown as Project,
          },
        }),
      });

      const outcome = await runCloudFetchVersion({ client, projectId: "cloud-proj-1", versionNumber: 1 });
      expect(outcome.kind).toBe("loaded");
      if (outcome.kind === "loaded") {
        expect(outcome.project.entities).toEqual([]);
      }
    });

    it("returns not-found on 404", async () => {
      const client = makeClient({
        getVersion: async () => ({
          ok: false,
          kind: "http",
          status: 404,
          code: "not-found",
          message: "Not found",
        }),
      });

      const outcome = await runCloudFetchVersion({ client, projectId: "cloud-proj-1", versionNumber: 99 });
      expect(outcome.kind).toBe("not-found");
    });

    it("returns unauthenticated on 401", async () => {
      const client = makeClient({
        getVersion: async () => ({
          ok: false,
          kind: "http",
          status: 401,
          code: "unauthenticated",
          message: "Unauthenticated",
        }),
      });

      const outcome = await runCloudFetchVersion({ client, projectId: "cloud-proj-1", versionNumber: 1 });
      expect(outcome.kind).toBe("unauthenticated");
    });

    it("returns network, timeout, or error on failures", async () => {
      const clientNet = makeClient({
        getVersion: async () => ({ ok: false, kind: "network", message: "Network error" }),
      });
      const netOutcome = await runCloudFetchVersion({ client: clientNet, projectId: "p", versionNumber: 1 });
      expect(netOutcome.kind).toBe("network");

      const clientTimeout = makeClient({
        getVersion: async () => ({ ok: false, kind: "timeout", message: "Timeout" }),
      });
      const timeoutOutcome = await runCloudFetchVersion({ client: clientTimeout, projectId: "p", versionNumber: 1 });
      expect(timeoutOutcome.kind).toBe("timeout");

      const clientErr = makeClient({
        getVersion: async () => ({
          ok: false,
          kind: "http",
          status: 500,
          code: "error",
          message: "Boom",
        }),
      });
      const errOutcome = await runCloudFetchVersion({ client: clientErr, projectId: "p", versionNumber: 1 });
      expect(errOutcome.kind).toBe("error");
    });
  });
});

