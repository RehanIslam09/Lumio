import type { Project } from "@repo/schema";
import {
  CURRENT_SCHEMA_VERSION,
  PROJECT_FORMAT,
  type SerializedProjectFile,
} from "./types.js";

/**
 * Serializes a Project object to a deterministic JSON file string.
 * Uses 2-space indentation and ends with a newline.
 */
export function serializeProject(project: Project, exportedAt: string): string {
  const file: SerializedProjectFile = {
    format: PROJECT_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt,
    project,
  };
  return JSON.stringify(file, null, 2) + "\n";
}
