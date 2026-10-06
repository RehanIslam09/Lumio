import type { Project } from "@repo/schema";
import type { ApiClient } from "../api/client.js";
import {
  CURRENT_SCHEMA_VERSION,
  validateProjectDocument,
} from "../persistence/index.js";
import type {
  AuthOutcome,
  DeleteOutcome,
  ListOutcome,
  OpenOutcome,
  ProjectBinding,
  SaveOutcome,
} from "./types.js";

export async function runCloudSave(params: {
  client: ApiClient;
  binding: ProjectBinding | null;
  snapshot: Project;
  schemaVersion: number;
}): Promise<SaveOutcome> {
  const { client, binding, snapshot, schemaVersion } = params;

  if (!binding) {
    const res = await client.createProject({
      schemaVersion,
      document: snapshot,
    });

    if (res.ok) {
      return {
        kind: "created",
        project: res.data.project,
        version: res.data.version,
        snapshot,
      };
    }

    if (res.kind === "network") return { kind: "network" };
    if (res.kind === "timeout") return { kind: "timeout" };

    if (res.code === "unauthenticated") return { kind: "unauthenticated" };
    if (res.code === "rate-limited") {
      return { kind: "rate-limited", retryAfterSeconds: res.retryAfterSeconds };
    }
    if (res.code === "project-limit-reached") return { kind: "limit-reached" };
    if (res.code === "payload-too-large" || res.code === "document-too-large") {
      return { kind: "too-large" };
    }
    if (res.code === "unsupported-schema-version") {
      return { kind: "unsupported-schema", supported: res.supported };
    }
    if (res.code === "invalid-request") {
      return { kind: "invalid", details: res.details };
    }

    return { kind: "error", message: res.message };
  }

  // Update existing project
  const res = await client.saveProject(binding.projectId, {
    baseVersion: binding.baseVersion,
    schemaVersion,
    document: snapshot,
  });

  if (res.ok) {
    return {
      kind: "saved",
      project: res.data.project,
      version: res.data.version,
      snapshot,
    };
  }

  if (res.kind === "network") return { kind: "network" };
  if (res.kind === "timeout") return { kind: "timeout" };

  if (res.code === "unauthenticated") return { kind: "unauthenticated" };
  if (res.code === "not-found") return { kind: "not-found" };
  if (res.code === "version-conflict") {
    return {
      kind: "conflict",
      currentVersion: res.currentVersion ?? binding.baseVersion + 1,
      snapshot,
    };
  }
  if (res.code === "rate-limited") {
    return { kind: "rate-limited", retryAfterSeconds: res.retryAfterSeconds };
  }
  if (res.code === "payload-too-large" || res.code === "document-too-large") {
    return { kind: "too-large" };
  }
  if (res.code === "unsupported-schema-version") {
    return { kind: "unsupported-schema", supported: res.supported };
  }
  if (res.code === "invalid-request") {
    return { kind: "invalid", details: res.details };
  }

  return { kind: "error", message: res.message };
}

export async function runCloudSaveOverwrite(params: {
  client: ApiClient;
  binding: ProjectBinding;
  currentVersion: number;
  snapshot: Project;
  schemaVersion: number;
}): Promise<SaveOutcome> {
  const overwrittenBinding: ProjectBinding = {
    ...params.binding,
    baseVersion: params.currentVersion,
  };

  return runCloudSave({
    client: params.client,
    binding: overwrittenBinding,
    snapshot: params.snapshot,
    schemaVersion: params.schemaVersion,
  });
}

export async function runCloudList(params: {
  client: ApiClient;
}): Promise<ListOutcome> {
  const res = await params.client.listProjects();
  if (res.ok) {
    return { kind: "listed", projects: res.data.projects };
  }
  if (res.kind === "network") return { kind: "network" };
  if (res.kind === "timeout") return { kind: "timeout" };
  if (res.code === "unauthenticated") return { kind: "unauthenticated" };
  return { kind: "error", message: res.message };
}

export async function runCloudOpen(params: {
  client: ApiClient;
  projectId: string;
}): Promise<OpenOutcome> {
  const res = await params.client.getProject(params.projectId);
  if (!res.ok) {
    if (res.kind === "network") return { kind: "network" };
    if (res.kind === "timeout") return { kind: "timeout" };
    if (res.code === "not-found") return { kind: "not-found" };
    if (res.code === "unauthenticated") return { kind: "unauthenticated" };
    return { kind: "error", message: res.message };
  }

  const { project: summary, version, document: rawDocument } = res.data;

  if (version.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      kind: "unsupported-schema",
      supported: CURRENT_SCHEMA_VERSION,
    };
  }

  const validated = validateProjectDocument(rawDocument);
  if (!validated.ok) {
    return {
      kind: "invalid-document",
      details: validated.error.details,
    };
  }

  return {
    kind: "loaded",
    project: validated.project,
    binding: {
      projectId: summary.id,
      baseVersion: version.versionNumber,
      name: summary.name,
    },
    warnings: validated.warnings,
  };
}

export async function runCloudDelete(params: {
  client: ApiClient;
  projectId: string;
}): Promise<DeleteOutcome> {
  const res = await params.client.deleteProject(params.projectId);
  if (res.ok) {
    return { kind: "deleted" };
  }
  if (res.kind === "network") return { kind: "network" };
  if (res.kind === "timeout") return { kind: "timeout" };
  if (res.code === "not-found") return { kind: "not-found" };
  if (res.code === "unauthenticated") return { kind: "unauthenticated" };
  return { kind: "error", message: res.message };
}

export async function runAuthRegister(params: {
  client: ApiClient;
  email: string;
  password: string;
}): Promise<AuthOutcome> {
  const res = await params.client.register({
    email: params.email,
    password: params.password,
  });

  if (res.ok) {
    return { kind: "signed-in", user: res.data.user };
  }
  if (res.kind === "network") return { kind: "network" };
  if (res.kind === "timeout") return { kind: "timeout" };
  if (res.code === "email-taken") return { kind: "email-taken" };
  if (res.code === "rate-limited") {
    return { kind: "rate-limited", retryAfterSeconds: res.retryAfterSeconds };
  }
  if (res.code === "invalid-request") {
    return { kind: "invalid-request", details: res.details };
  }
  return { kind: "error", message: res.message };
}

export async function runAuthLogin(params: {
  client: ApiClient;
  email: string;
  password: string;
}): Promise<AuthOutcome> {
  const res = await params.client.login({
    email: params.email,
    password: params.password,
  });

  if (res.ok) {
    return { kind: "signed-in", user: res.data.user };
  }
  if (res.kind === "network") return { kind: "network" };
  if (res.kind === "timeout") return { kind: "timeout" };
  if (res.code === "invalid-credentials") return { kind: "invalid-credentials" };
  if (res.code === "rate-limited") {
    return { kind: "rate-limited", retryAfterSeconds: res.retryAfterSeconds };
  }
  if (res.code === "invalid-request") {
    return { kind: "invalid-request", details: res.details };
  }
  return { kind: "error", message: res.message };
}

export async function runAuthLogout(params: {
  client: ApiClient;
}): Promise<AuthOutcome> {
  const res = await params.client.logout();
  if (res.ok) {
    return { kind: "anonymous" };
  }
  if (res.kind === "network") return { kind: "network" };
  if (res.kind === "timeout") return { kind: "timeout" };
  return { kind: "anonymous" }; // Logout always resets to anonymous on client
}

export async function runAuthMe(params: {
  client: ApiClient;
}): Promise<AuthOutcome> {
  const res = await params.client.me();
  if (res.ok) {
    return { kind: "signed-in", user: res.data.user };
  }
  if (res.kind === "network") return { kind: "network" };
  if (res.kind === "timeout") return { kind: "timeout" };
  if (res.code === "unauthenticated") return { kind: "anonymous" };
  return { kind: "error", message: res.message };
}
