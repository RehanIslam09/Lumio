import type { Project } from "@repo/schema";

export class DocumentTooLargeError extends Error {
  constructor(message = "Document exceeds maximum allowed size") {
    super(message);
    this.name = "DocumentTooLargeError";
  }
}

export interface PublicProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  latestVersion: number;
}

export interface PublicVersionSummary {
  versionNumber: number;
  schemaVersion: number;
  createdAt: string;
  createdByMe: boolean;
}

export interface PublicVersionDetail {
  versionNumber: number;
  schemaVersion: number;
  createdAt: string;
}

export type SaveNewVersionResult =
  | { ok: true; project: PublicProject; version: PublicVersionDetail }
  | { ok: false; code: "not-found" }
  | { ok: false; code: "version-conflict"; currentVersion: number };

export type CreateWithFirstVersionResult =
  | { ok: true; project: PublicProject; version: PublicVersionDetail }
  | { ok: false; code: "project-limit-reached" };

export type GetLatestResult =
  | { ok: true; project: PublicProject; version: PublicVersionDetail; document: Project }
  | { ok: false; code: "not-found" };

export type ListVersionsResult =
  | { ok: true; versions: PublicVersionSummary[] }
  | { ok: false; code: "not-found" };

export type GetVersionResult =
  | { ok: true; version: PublicVersionDetail; document: Project }
  | { ok: false; code: "not-found" };

export type DeleteOwnedResult =
  | { ok: true }
  | { ok: false; code: "not-found" };

export interface ProjectRepo {
  createWithFirstVersion(params: {
    ownerId: string;
    document: Project;
    schemaVersion: number;
    maxProjectsPerUser: number;
    now: Date;
  }): Promise<CreateWithFirstVersionResult>;

  saveNewVersion(params: {
    id: string;
    ownerId: string;
    baseVersion: number;
    schemaVersion: number;
    document: Project;
    now: Date;
  }): Promise<SaveNewVersionResult>;

  listForOwner(ownerId: string, limit?: number): Promise<PublicProject[]>;

  getLatest(params: {
    id: string;
    ownerId: string;
  }): Promise<GetLatestResult>;

  listVersions(params: {
    id: string;
    ownerId: string;
    limit?: number;
  }): Promise<ListVersionsResult>;

  getVersion(params: {
    id: string;
    ownerId: string;
    versionNumber: number;
  }): Promise<GetVersionResult>;

  deleteOwned(params: {
    id: string;
    ownerId: string;
  }): Promise<DeleteOwnedResult>;
}
