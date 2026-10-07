import { z } from "zod";

// --- Schema Versions & Caps ---
export const CURRENT_SCHEMA_VERSION = 2;
export const MIN_SUPPORTED_SCHEMA_VERSION = 1;
export const MAX_ENTITIES_PER_PROJECT = 1000;
export const MAX_ENTITY_NAME_CODE_POINTS = 120;
export const MAX_ENTITY_DESC_CODE_POINTS = 5000;
export const MAX_NODE_BODY_CODE_POINTS = 20000;

/**
 * Counts Unicode code points using a fast loop (without spreading or Array.from on large strings).
 */
export function countCodePoints(str: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // If high surrogate, check for following low surrogate
    if (code >= 0xd800 && code <= 0xdbff) {
      if (i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          i++; // Skip paired low surrogate
        }
      }
    }
    count++;
  }
  return count;
}

/**
 * Pure predicate verifying whether a schema version is supported for reading.
 */
export function isReadableSchemaVersion(v: unknown): boolean {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= MIN_SUPPORTED_SCHEMA_VERSION &&
    v <= CURRENT_SCHEMA_VERSION
  );
}

// --- Entity Schema ---
export const EntityKindSchema = z.enum(["character", "location", "item"]);
export type EntityKind = z.infer<typeof EntityKindSchema>;

export const EntitySchema = z.object({
  id: z.string().min(1, "Entity id must not be empty"),
  kind: EntityKindSchema,
  name: z
    .string()
    .refine((s) => s.trim().length > 0, "Entity name must contain at least one non-whitespace character")
    .refine((s) => countCodePoints(s) <= MAX_ENTITY_NAME_CODE_POINTS, `Entity name must not exceed ${MAX_ENTITY_NAME_CODE_POINTS} code points`),
  description: z
    .string()
    .refine((s) => countCodePoints(s) <= MAX_ENTITY_DESC_CODE_POINTS, `Entity description must not exceed ${MAX_ENTITY_DESC_CODE_POINTS} code points`)
    .optional(),
});
export type Entity = z.infer<typeof EntitySchema>;

// --- Flow Node Schema ---
export const FlowNodeTypeSchema = z.enum(["start", "scene", "end"]);
export type FlowNodeType = z.infer<typeof FlowNodeTypeSchema>;

export const FlowNodePositionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .refine(
    (pos) => Number.isFinite(pos.x) && Number.isFinite(pos.y),
    "Position coordinates must be finite numbers",
  );
export type FlowNodePosition = z.infer<typeof FlowNodePositionSchema>;

export const FlowNodeSchema = z.object({
  id: z.string(),
  type: FlowNodeTypeSchema,
  title: z.string(),
  position: FlowNodePositionSchema.optional(),
  body: z
    .string()
    .refine((s) => countCodePoints(s) <= MAX_NODE_BODY_CODE_POINTS, `Node body must not exceed ${MAX_NODE_BODY_CODE_POINTS} code points`)
    .optional(),
  speakerId: z.string().optional(),
});
export type FlowNode = z.infer<typeof FlowNodeSchema>;

// --- Variable Schema ---
export const VariableTypeSchema = z.enum(["number", "string", "boolean"]);
export type VariableType = z.infer<typeof VariableTypeSchema>;

export const VariableNameSchema = z
  .string()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    "Variable name must match [A-Za-z_][A-Za-z0-9_]*",
  )
  .refine(
    (name) => name !== "true" && name !== "false",
    "Variable name must not be a reserved boolean literal ('true' or 'false')",
  );

export const VariableSchema = z
  .object({
    id: z.string(),
    name: VariableNameSchema,
    type: VariableTypeSchema,
    initial: z.union([z.number(), z.string(), z.boolean()]).optional(),
  })
  .refine(
    (data) => {
      if (data.initial === undefined) return true;
      if (data.type === "number") {
        return typeof data.initial === "number" && Number.isFinite(data.initial);
      }
      return typeof data.initial === data.type;
    },
    { message: "initial value type must match variable type and numbers must be finite" },
  );
export type Variable = z.infer<typeof VariableSchema>;

// --- Flow Edge Schema ---
export const FlowEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  condition: z.string().optional(),
  effects: z.array(z.string()).optional(),
});
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;

// --- Project Schema ---
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  nodes: z.array(FlowNodeSchema),
  edges: z.array(FlowEdgeSchema),
  variables: z.array(VariableSchema),
  entities: z
    .array(EntitySchema)
    .max(MAX_ENTITIES_PER_PROJECT, `Project cannot exceed ${MAX_ENTITIES_PER_PROJECT} entities`)
    .optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

/**
 * Returns entities array for a project, falling back to empty array if omitted.
 */
export function getEntities(project: Project): readonly Entity[] {
  return project.entities ?? [];
}

// --- Derived Known Shape Keys ---
export const KNOWN_PROJECT_KEYS: ReadonlySet<string> = new Set(Object.keys(ProjectSchema.shape));
export const KNOWN_NODE_KEYS: ReadonlySet<string> = new Set(Object.keys(FlowNodeSchema.shape));
export const KNOWN_EDGE_KEYS: ReadonlySet<string> = new Set(Object.keys(FlowEdgeSchema.shape));
export const KNOWN_VARIABLE_KEYS: ReadonlySet<string> = new Set(Object.keys(VariableSchema.shape));
export const KNOWN_ENTITY_KEYS: ReadonlySet<string> = new Set(Object.keys(EntitySchema.shape));

// --- Integrity Helpers ---
export interface IntegrityDetail {
  path: string;
  message: string;
}

export function checkEntityAndSpeakerDetails(project: Project): IntegrityDetail[] {
  const details: IntegrityDetail[] = [];
  const entities = project.entities ?? [];

  // 1. Entity count cap
  if (entities.length > MAX_ENTITIES_PER_PROJECT) {
    details.push({
      path: "entities",
      message: `Project exceeds maximum entity limit of ${MAX_ENTITIES_PER_PROJECT}`,
    });
  }

  // 2. Entity id non-empty and unique
  const seenEntityIds = new Set<string>();
  for (const [i, entity] of entities.entries()) {
    if (!entity.id || entity.id.trim().length === 0) {
      details.push({
        path: `entities[${i}].id`,
        message: "Entity ID must not be empty",
      });
    } else if (seenEntityIds.has(entity.id)) {
      details.push({
        path: `entities[${i}].id`,
        message: `Duplicate entity ID: "${entity.id}"`,
      });
    } else {
      seenEntityIds.add(entity.id);
    }
  }

  // 3. SpeakerId reference and character kind
  const entityMap = new Map<string, Entity>();
  for (const entity of entities) {
    if (entity.id && !entityMap.has(entity.id)) {
      entityMap.set(entity.id, entity);
    }
  }

  for (const [i, node] of project.nodes.entries()) {
    if (node.speakerId) {
      const entity = entityMap.get(node.speakerId);
      if (!entity) {
        details.push({
          path: `nodes[${i}].speakerId`,
          message: `Node "${node.title}" references missing speaker "${node.speakerId}"`,
        });
      } else if (entity.kind !== "character") {
        details.push({
          path: `nodes[${i}].speakerId`,
          message: `Node "${node.title}" references speaker "${node.speakerId}" which is a "${entity.kind}", not a character`,
        });
      }
    }
  }

  return details;
}

export function checkEntityAndSpeakerIntegrity(project: Project): string[] {
  return checkEntityAndSpeakerDetails(project).map((d) => d.message);
}

// --- Pure Migration Module ---
export type MigrationResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

export type MigrationStepFn = (data: unknown) => unknown;

export const MIGRATION_STEPS: Record<number, MigrationStepFn> = {
  // v1 -> v2: adds empty entities array if not already present
  2: (data: unknown) => {
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      return {
        ...obj,
        entities: Array.isArray(obj.entities) ? obj.entities : [],
      };
    }
    return data;
  },
};

/**
 * Pure, chained, versioned migration function.
 * Migrates a raw project object from fromVersion up to CURRENT_SCHEMA_VERSION.
 * Never throws, never returns a partially migrated value.
 */
export function migrate(raw: unknown, fromVersion: number): MigrationResult {
  if (
    typeof fromVersion !== "number" ||
    !Number.isInteger(fromVersion) ||
    fromVersion < MIN_SUPPORTED_SCHEMA_VERSION ||
    fromVersion > CURRENT_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      reason: `Unsupported schema version: ${String(fromVersion)}`,
    };
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      reason: "Invalid project document (expected object)",
    };
  }

  let current: unknown = raw;
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const nextVersion = v + 1;
    const step = MIGRATION_STEPS[nextVersion];
    if (step) {
      try {
        current = step(current);
      } catch (err) {
        return {
          ok: false,
          reason: `Migration to version ${nextVersion} failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  }

  return { ok: true, value: current };
}

// --- Issues Schema ---
export const IssueRuleIdSchema = z.enum([
  "unreachable-from-start",
  "cannot-reach-end",
  "invalid-expression",
  "undefined-variable",
  "type-mismatch",
  "unused-variable",
  "variable-never-written",
  "variable-never-read",
]);
export type IssueRuleId = z.infer<typeof IssueRuleIdSchema>;

export const IssueSeveritySchema = z.enum(["error", "warning"]);
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;

export const IssueLocationSchema = z.object({
  edgeId: z.string(),
  field: z.enum(["condition", "effect"]),
  effectIndex: z.number().int().nonnegative().optional(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
export type IssueLocation = z.infer<typeof IssueLocationSchema>;

export const IssueSchema = z
  .object({
    ruleId: IssueRuleIdSchema,
    severity: IssueSeveritySchema,
    nodeId: z.string().optional(),
    variableId: z.string().optional(),
    message: z.string(),
    location: IssueLocationSchema.optional(),
  })
  .refine(
    (issue) => (issue.nodeId !== undefined) !== (issue.variableId !== undefined),
    { message: "Exactly one of nodeId or variableId must be present" },
  );
export type Issue = z.infer<typeof IssueSchema>;
