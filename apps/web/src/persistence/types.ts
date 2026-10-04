import type { Project } from "@repo/schema";

export const MAX_FILE_BYTES = 5_000_000;
export const CURRENT_SCHEMA_VERSION = 1;
export const PROJECT_FORMAT = "lumio-project";

export type ParseFileErrorCode =
  | "too-large"
  | "not-json"
  | "wrong-format"
  | "unsupported-version"
  | "invalid-project"
  | "integrity";

export interface ParseFileError {
  code: ParseFileErrorCode;
  message: string;
  details: string[];
}

export type ParseFileResult =
  | { ok: true; project: Project; warnings: string[] }
  | { ok: false; error: ParseFileError };

export interface SerializedProjectFile {
  format: "lumio-project";
  schemaVersion: number;
  exportedAt: string;
  project: Project;
}
