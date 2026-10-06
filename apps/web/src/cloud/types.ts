import type { Project } from "@repo/schema";
import type {
  ProjectSummaryDto,
  ServerErrorDetail,
  UserDto,
  VersionDto,
} from "../api/types.js";

export interface ProjectBinding {
  projectId: string;
  baseVersion: number;
  name: string;
}

export type SaveOutcome =
  | { kind: "created"; project: ProjectSummaryDto; version: VersionDto; snapshot: Project }
  | { kind: "saved"; project: ProjectSummaryDto; version: VersionDto; snapshot: Project }
  | { kind: "conflict"; currentVersion: number; snapshot: Project }
  | { kind: "not-found" }
  | { kind: "unauthenticated" }
  | { kind: "rate-limited"; retryAfterSeconds?: number }
  | { kind: "invalid"; details?: ServerErrorDetail[] }
  | { kind: "too-large" }
  | { kind: "limit-reached" }
  | { kind: "unsupported-schema"; supported?: number }
  | { kind: "network" }
  | { kind: "timeout" }
  | { kind: "error"; message: string };

export type ListOutcome =
  | { kind: "listed"; projects: ProjectSummaryDto[] }
  | { kind: "unauthenticated" }
  | { kind: "network" }
  | { kind: "timeout" }
  | { kind: "error"; message: string };

export type OpenOutcome =
  | { kind: "loaded"; project: Project; binding: ProjectBinding; warnings: string[] }
  | { kind: "not-found" }
  | { kind: "unauthenticated" }
  | { kind: "unsupported-schema"; supported?: number }
  | { kind: "invalid-document"; details: string[] }
  | { kind: "network" }
  | { kind: "timeout" }
  | { kind: "error"; message: string };

export type DeleteOutcome =
  | { kind: "deleted" }
  | { kind: "not-found" }
  | { kind: "unauthenticated" }
  | { kind: "network" }
  | { kind: "timeout" }
  | { kind: "error"; message: string };

export type AuthOutcome =
  | { kind: "signed-in"; user: UserDto }
  | { kind: "anonymous" }
  | { kind: "invalid-request"; details?: ServerErrorDetail[] }
  | { kind: "invalid-credentials" }
  | { kind: "email-taken" }
  | { kind: "rate-limited"; retryAfterSeconds?: number }
  | { kind: "network" }
  | { kind: "timeout" }
  | { kind: "error"; message: string };
