import {
  ProjectSchema,
  CURRENT_SCHEMA_VERSION,
  checkEntityAndSpeakerDetails,
  type Project,
} from "@repo/schema";

export const SUPPORTED_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

export interface ValidationErrorDetail {
  path: string;
  message: string;
}

export type ValidationFailureCode = "invalid-request" | "unsupported-schema-version";

export type ValidateProjectInputResult =
  | {
      ok: true;
      value: {
        schemaVersion: number;
        baseVersion?: number;
        document: Project;
      };
    }
  | {
      ok: false;
      code: ValidationFailureCode;
      details: ValidationErrorDetail[];
      supported?: number;
    };

export interface ValidateProjectInputOptions {
  requireBaseVersion: boolean;
}

/**
 * Scans code units to verify whether a string is well-formed Unicode
 * (no lone high or low surrogates).
 */
export function isWellFormedUnicode(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // High surrogate: 0xD800 .. 0xDBFF
    if (code >= 0xd800 && code <= 0xdbff) {
      if (i + 1 >= str.length) return false;
      const nextCode = str.charCodeAt(i + 1);
      // Low surrogate: 0xDC00 .. 0xDFFF
      if (nextCode < 0xdc00 || nextCode > 0xdfff) return false;
      i++; // Skip paired low surrogate
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Unpaired low surrogate
      return false;
    }
  }
  return true;
}

/**
 * Iterative walk over any JSON-compatible object checking string values and object keys
 * for U+0000 and lone surrogates. Never echoes content.
 */
export function walkTextSafety(
  root: unknown,
  initialPath = "document",
): ValidationErrorDetail[] {
  const details: ValidationErrorDetail[] = [];
  interface StackFrame {
    val: unknown;
    path: string;
  }
  const stack: StackFrame[] = [{ val: root, path: initialPath }];

  while (stack.length > 0 && details.length < 10) {
    const frame = stack.pop();
    if (!frame) break;
    const { val, path } = frame;

    if (typeof val === "string") {
      if (val.includes("\u0000")) {
        details.push({
          path,
          message: "String contains disallowed null byte (U+0000)",
        });
      } else if (!isWellFormedUnicode(val)) {
        details.push({
          path,
          message: "String contains invalid Unicode (lone surrogate)",
        });
      }
    } else if (Array.isArray(val)) {
      for (let i = val.length - 1; i >= 0; i--) {
        stack.push({ val: val[i], path: `${path}[${i}]` });
      }
    } else if (typeof val === "object" && val !== null) {
      const entries = Object.entries(val as Record<string, unknown>);
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (!entry) continue;
        const [k, v] = entry;
        if (k.includes("\u0000")) {
          details.push({
            path: `${path}.${k}`,
            message: "Object key contains disallowed null byte (U+0000)",
          });
        } else if (!isWellFormedUnicode(k)) {
          details.push({
            path: `${path}.${k}`,
            message: "Object key contains invalid Unicode (lone surrogate)",
          });
        }
        stack.push({
          val: v,
          path: `${path}.${k}`,
        });
      }
    }
  }

  return details;
}

/**
 * Validates project input payloads for create and update endpoints.
 * Never throws for any input; reasons and details never echo document content.
 */
export function validateProjectInput(
  raw: unknown,
  options: ValidateProjectInputOptions,
): ValidateProjectInputResult {
  // 1. Envelope validation
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      code: "invalid-request",
      details: [{ path: "body", message: "Request body must be a JSON object" }],
    };
  }

  const envelope = raw as Record<string, unknown>;

  // schemaVersion
  const schemaVersion = envelope.schemaVersion;
  if (
    typeof schemaVersion !== "number" ||
    !Number.isInteger(schemaVersion) ||
    schemaVersion < 1
  ) {
    return {
      ok: false,
      code: "invalid-request",
      details: [
        {
          path: "schemaVersion",
          message: "schemaVersion must be an integer greater than or equal to 1",
        },
      ],
    };
  }

  // baseVersion
  let baseVersion: number | undefined;
  if (options.requireBaseVersion) {
    if (
      typeof envelope.baseVersion !== "number" ||
      !Number.isInteger(envelope.baseVersion) ||
      envelope.baseVersion < 1
    ) {
      return {
        ok: false,
        code: "invalid-request",
        details: [
          {
            path: "baseVersion",
            message: "baseVersion must be an integer greater than or equal to 1",
          },
        ],
      };
    }
    baseVersion = envelope.baseVersion;
  } else if (envelope.baseVersion !== undefined) {
    if (
      typeof envelope.baseVersion !== "number" ||
      !Number.isInteger(envelope.baseVersion) ||
      envelope.baseVersion < 1
    ) {
      return {
        ok: false,
        code: "invalid-request",
        details: [
          {
            path: "baseVersion",
            message: "baseVersion must be an integer greater than or equal to 1",
          },
        ],
      };
    }
    baseVersion = envelope.baseVersion;
  }

  // document must be an object
  if (
    typeof envelope.document !== "object" ||
    envelope.document === null ||
    Array.isArray(envelope.document)
  ) {
    return {
      ok: false,
      code: "invalid-request",
      details: [{ path: "document", message: "document must be a JSON object" }],
    };
  }

  // 2. schemaVersion must equal CURRENT_SCHEMA_VERSION
  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      code: "unsupported-schema-version",
      supported: CURRENT_SCHEMA_VERSION,
      details: [
        {
          path: "schemaVersion",
          message: `Unsupported schema version (supported version is ${CURRENT_SCHEMA_VERSION})`,
        },
      ],
    };
  }

  // 3. Document parsed with ProjectSchema (parsed output strips unknown keys)
  const parseResult = ProjectSchema.safeParse(envelope.document);
  if (!parseResult.success) {
    const details: ValidationErrorDetail[] = parseResult.error.issues
      .slice(0, 10)
      .map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join(".") : "document",
        message: issue.message,
      }));
    return {
      ok: false,
      code: "invalid-request",
      details,
    };
  }

  const project: Project = parseResult.data;

  // 4. Graph Integrity rules
  const integrityDetails: ValidationErrorDetail[] = [];

  // (a) Unique node IDs
  const seenNodeIds = new Set<string>();
  for (const [i, node] of project.nodes.entries()) {
    if (seenNodeIds.has(node.id)) {
      integrityDetails.push({
        path: `nodes[${i}].id`,
        message: `Duplicate node ID: "${node.id}"`,
      });
    } else {
      seenNodeIds.add(node.id);
    }
  }

  // (b) Unique edge IDs
  const seenEdgeIds = new Set<string>();
  for (const [i, edge] of project.edges.entries()) {
    if (seenEdgeIds.has(edge.id)) {
      integrityDetails.push({
        path: `edges[${i}].id`,
        message: `Duplicate edge ID: "${edge.id}"`,
      });
    } else {
      seenEdgeIds.add(edge.id);
    }
  }

  // (c) Unique variable IDs
  const seenVarIds = new Set<string>();
  for (const [i, variable] of project.variables.entries()) {
    if (seenVarIds.has(variable.id)) {
      integrityDetails.push({
        path: `variables[${i}].id`,
        message: `Duplicate variable ID: "${variable.id}"`,
      });
    } else {
      seenVarIds.add(variable.id);
    }
  }

  // (d) Edge source and target node references
  for (const [i, edge] of project.edges.entries()) {
    if (!seenNodeIds.has(edge.from)) {
      integrityDetails.push({
        path: `edges[${i}].from`,
        message: `Edge "${edge.id}" references missing source node "${edge.from}"`,
      });
    }
    if (!seenNodeIds.has(edge.to)) {
      integrityDetails.push({
        path: `edges[${i}].to`,
        message: `Edge "${edge.id}" references missing target node "${edge.to}"`,
      });
    }
  }

  // (e) Entity and speaker integrity
  const entityDetails = checkEntityAndSpeakerDetails(project);
  for (const d of entityDetails) {
    integrityDetails.push(d);
  }

  if (integrityDetails.length > 0) {
    return {
      ok: false,
      code: "invalid-request",
      details: integrityDetails.slice(0, 10),
    };
  }

  // 5. Text safety: iterative walk over the parsed document (explicit stack)
  const textSafetyDetails = walkTextSafety(project, "document");
  if (textSafetyDetails.length > 0) {
    return {
      ok: false,
      code: "invalid-request",
      details: textSafetyDetails.slice(0, 10),
    };
  }

  // 6. Name validation: non-whitespace and <= 200 Unicode code points
  const trimmedName = project.name.trim();
  if (trimmedName.length === 0) {
    return {
      ok: false,
      code: "invalid-request",
      details: [
        {
          path: "document.name",
          message: "Project name must contain at least one non-whitespace character",
        },
      ],
    };
  }

  const codePointCount = Array.from(project.name).length;
  if (codePointCount > 200) {
    return {
      ok: false,
      code: "invalid-request",
      details: [
        {
          path: "document.name",
          message: "Project name must not exceed 200 Unicode code points",
        },
      ],
    };
  }

  return {
    ok: true,
    value: {
      schemaVersion,
      baseVersion,
      document: project,
    },
  };
}
