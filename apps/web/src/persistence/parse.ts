import { ProjectSchema } from "@repo/schema";
import {
  MAX_FILE_BYTES,
  CURRENT_SCHEMA_VERSION,
  PROJECT_FORMAT,
  type ParseFileResult,
} from "./types.js";

export type MigrationFn = (data: unknown) => unknown;

/**
 * Migration table keyed by target version.
 * Version 1 is the baseline; future versions register transformation functions here.
 */
export const MIGRATIONS: Record<number, MigrationFn> = {
  1: (data: unknown) => data,
};

/**
 * Validates raw byte length against MAX_FILE_BYTES.
 * Returns a 'too-large' ParseFileResult if exceeded, or null if size is acceptable.
 */
export function checkFileSizeBytes(bytes: number): ParseFileResult | null {
  if (bytes > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: {
        code: "too-large",
        message: `File size (${bytes} bytes) exceeds maximum allowed size (${MAX_FILE_BYTES} bytes)`,
        details: [],
      },
    };
  }
  return null;
}

/**
 * Detects unknown properties present on the raw project object or its children
 * that will be stripped during schema parsing.
 */
function detectUnknownProperties(rawProject: unknown): string[] {
  const warnings: string[] = [];
  if (typeof rawProject !== "object" || rawProject === null || Array.isArray(rawProject)) {
    return warnings;
  }

  const rawObj = rawProject as Record<string, unknown>;
  const allowedProjectKeys = new Set(["id", "name", "nodes", "edges", "variables"]);
  const unknownProjectKeys = Object.keys(rawObj).filter((k) => !allowedProjectKeys.has(k));
  if (unknownProjectKeys.length > 0) {
    warnings.push(`Ignored unknown project properties: ${unknownProjectKeys.join(", ")}`);
  }

  if (Array.isArray(rawObj.nodes)) {
    const allowedNodeKeys = new Set(["id", "type", "title", "position"]);
    const unknownNodeKeys = new Set<string>();
    for (const node of rawObj.nodes) {
      if (typeof node === "object" && node !== null) {
        for (const k of Object.keys(node)) {
          if (!allowedNodeKeys.has(k)) unknownNodeKeys.add(k);
        }
      }
    }
    if (unknownNodeKeys.size > 0) {
      warnings.push(`Ignored unknown node properties: ${Array.from(unknownNodeKeys).join(", ")}`);
    }
  }

  if (Array.isArray(rawObj.edges)) {
    const allowedEdgeKeys = new Set(["id", "from", "to", "condition", "effects"]);
    const unknownEdgeKeys = new Set<string>();
    for (const edge of rawObj.edges) {
      if (typeof edge === "object" && edge !== null) {
        for (const k of Object.keys(edge)) {
          if (!allowedEdgeKeys.has(k)) unknownEdgeKeys.add(k);
        }
      }
    }
    if (unknownEdgeKeys.size > 0) {
      warnings.push(`Ignored unknown edge properties: ${Array.from(unknownEdgeKeys).join(", ")}`);
    }
  }

  if (Array.isArray(rawObj.variables)) {
    const allowedVarKeys = new Set(["id", "name", "type", "initial"]);
    const unknownVarKeys = new Set<string>();
    for (const v of rawObj.variables) {
      if (typeof v === "object" && v !== null) {
        for (const k of Object.keys(v)) {
          if (!allowedVarKeys.has(k)) unknownVarKeys.add(k);
        }
      }
    }
    if (unknownVarKeys.size > 0) {
      warnings.push(`Ignored unknown variable properties: ${Array.from(unknownVarKeys).join(", ")}`);
    }
  }

  return warnings;
}

/**
 * Parses, validates, and integrity-checks a Lumio project file string.
 * Never throws for any input string.
 */
export function parseProjectFile(text: string): ParseFileResult {
  try {
    // 1. Check size in UTF-8 bytes before parsing
    const byteLength = new TextEncoder().encode(text).length;
    const sizeError = checkFileSizeBytes(byteLength);
    if (sizeError) {
      return sizeError;
    }

    // 2. Parse JSON
    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(text);
    } catch (e) {
      return {
        ok: false,
        error: {
          code: "not-json",
          message: `Failed to parse file as JSON: ${e instanceof Error ? e.message : String(e)}`,
          details: [],
        },
      };
    }

    // 3. Object & format marker validation
    if (typeof parsedRaw !== "object" || parsedRaw === null || Array.isArray(parsedRaw)) {
      return {
        ok: false,
        error: {
          code: "wrong-format",
          message: "File content is not a JSON object",
          details: [],
        },
      };
    }

    const fileObj = parsedRaw as Record<string, unknown>;
    if (fileObj.format !== PROJECT_FORMAT) {
      return {
        ok: false,
        error: {
          code: "wrong-format",
          message: `Invalid format marker (expected "${PROJECT_FORMAT}")`,
          details: [],
        },
      };
    }

    // 4. Schema version validation
    const version = fileObj.schemaVersion;
    if (typeof version !== "number" || !Number.isInteger(version) || version <= 0) {
      return {
        ok: false,
        error: {
          code: "wrong-format",
          message: "Invalid schema version (expected positive integer)",
          details: [],
        },
      };
    }

    if (version > CURRENT_SCHEMA_VERSION) {
      return {
        ok: false,
        error: {
          code: "unsupported-version",
          message: `File schema version (${version}) comes from a newer version of Lumio (current version is ${CURRENT_SCHEMA_VERSION}). Please update the application to open this file.`,
          details: [],
        },
      };
    }

    // 5. Apply migrations if version < CURRENT_SCHEMA_VERSION
    let rawProject: unknown = fileObj.project;
    for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
      const migrator = MIGRATIONS[v + 1];
      if (migrator) {
        rawProject = migrator(rawProject);
      }
    }

    // 6. Detect stripped unknown properties before schema parsing
    const warnings = detectUnknownProperties(rawProject);

    // 7. Schema validation with ProjectSchema
    const parseResult = ProjectSchema.safeParse(rawProject);
    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      const details = issues.slice(0, 10).map((issue) => {
        const pathStr = issue.path.join(".");
        return pathStr ? `${pathStr}: ${issue.message}` : issue.message;
      });
      if (issues.length > 10) {
        details.push(`...and ${issues.length - 10} more`);
      }
      return {
        ok: false,
        error: {
          code: "invalid-project",
          message: "Project schema validation failed",
          details,
        },
      };
    }

    const project = parseResult.data;

    // 8. Integrity validation (uniqueness & referential integrity)
    const integrityDetails: string[] = [];

    // (a) node ids are unique
    const seenNodeIds = new Set<string>();
    for (const node of project.nodes) {
      if (seenNodeIds.has(node.id)) {
        integrityDetails.push(`Duplicate node ID: "${node.id}"`);
      } else {
        seenNodeIds.add(node.id);
      }
    }

    // (b) edge ids are unique
    const seenEdgeIds = new Set<string>();
    for (const edge of project.edges) {
      if (seenEdgeIds.has(edge.id)) {
        integrityDetails.push(`Duplicate edge ID: "${edge.id}"`);
      } else {
        seenEdgeIds.add(edge.id);
      }
    }

    // (c) variable ids are unique (names can duplicate)
    const seenVarIds = new Set<string>();
    for (const variable of project.variables) {
      if (seenVarIds.has(variable.id)) {
        integrityDetails.push(`Duplicate variable ID: "${variable.id}"`);
      } else {
        seenVarIds.add(variable.id);
      }
    }

    // (d) edge from and to references point to existing node ids
    for (const edge of project.edges) {
      if (!seenNodeIds.has(edge.from)) {
        integrityDetails.push(`Edge "${edge.id}" references missing source node "${edge.from}"`);
      }
      if (!seenNodeIds.has(edge.to)) {
        integrityDetails.push(`Edge "${edge.id}" references missing target node "${edge.to}"`);
      }
    }

    if (integrityDetails.length > 0) {
      const cappedDetails = integrityDetails.slice(0, 10);
      if (integrityDetails.length > 10) {
        cappedDetails.push(`...and ${integrityDetails.length - 10} more`);
      }
      return {
        ok: false,
        error: {
          code: "integrity",
          message: "Project graph integrity validation failed",
          details: cappedDetails,
        },
      };
    }

    return {
      ok: true,
      project,
      warnings,
    };
  } catch (unexpectedError) {
    return {
      ok: false,
      error: {
        code: "not-json",
        message: `Unexpected file processing error: ${unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError)}`,
        details: [],
      },
    };
  }
}
