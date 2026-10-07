import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { generateBenchmarkProject } from "../benchmark/generator.js";
import { parseProjectFile } from "../persistence/index.js";
import {
  CURRENT_SCHEMA_VERSION,
  MIN_SUPPORTED_SCHEMA_VERSION,
  MAX_ENTITIES_PER_PROJECT,
  MAX_ENTITY_NAME_CODE_POINTS,
  MAX_ENTITY_DESC_CODE_POINTS,
  MAX_NODE_BODY_CODE_POINTS,
  countCodePoints,
  isReadableSchemaVersion,
  getEntities,
  EntitySchema,
  FlowNodeSchema,
  FlowEdgeSchema,
  VariableSchema,
  ProjectSchema,
  KNOWN_PROJECT_KEYS,
  KNOWN_NODE_KEYS,
  KNOWN_EDGE_KEYS,
  KNOWN_VARIABLE_KEYS,
  KNOWN_ENTITY_KEYS,
  checkEntityAndSpeakerIntegrity,
  migrate,
  type Project,
} from "@repo/schema";

describe("Schema v2 and Migration", () => {
  describe("Constants", () => {
    it("exports expected version constants and limits", () => {
      expect(CURRENT_SCHEMA_VERSION).toBe(2);
      expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
      expect(MAX_ENTITIES_PER_PROJECT).toBe(1000);
      expect(MAX_ENTITY_NAME_CODE_POINTS).toBe(120);
      expect(MAX_ENTITY_DESC_CODE_POINTS).toBe(5000);
      expect(MAX_NODE_BODY_CODE_POINTS).toBe(20000);
    });
  });

  describe("countCodePoints", () => {
    it("correctly counts ASCII, surrogate pairs, and multi-byte characters", () => {
      expect(countCodePoints("hello")).toBe(5);
      // Single emoji surrogate pair (UTF-16 length is 2, code point count is 1)
      expect(countCodePoints("👋")).toBe(1);
      expect(countCodePoints("hello 👋 world")).toBe(13);
      // Multi-byte Chinese characters
      expect(countCodePoints("你好")).toBe(2);
      expect(countCodePoints("")).toBe(0);
    });

    it("evaluates string at exact cap and one over cap", () => {
      const emoji = "🌟"; // 1 code point
      const exactlyAtCap = emoji.repeat(120);
      const overCap = emoji.repeat(121);
      expect(countCodePoints(exactlyAtCap)).toBe(120);
      expect(countCodePoints(overCap)).toBe(121);
    });
  });

  describe("isReadableSchemaVersion table test", () => {
    const table: Array<[input: unknown, expected: boolean]> = [
      [0, false],
      [1, true],
      [2, true],
      [3, false],
      [-1, false],
      [1.5, false],
      ["2", false],
      [Number.NaN, false],
      [null, false],
      [undefined, false],
      [Number.POSITIVE_INFINITY, false],
    ];

    it.each(table)("isReadableSchemaVersion(%j) -> %s", (input, expected) => {
      expect(isReadableSchemaVersion(input)).toBe(expected);
    });
  });

  describe("getEntities helper", () => {
    it("returns empty array for project without entities key", () => {
      const proj: Project = {
        id: "p1",
        name: "Test",
        nodes: [],
        edges: [],
        variables: [],
      };
      expect(getEntities(proj)).toEqual([]);
    });

    it("returns entities array when present", () => {
      const entities = [{ id: "c1", kind: "character" as const, name: "Alice" }];
      const proj: Project = {
        id: "p1",
        name: "Test",
        nodes: [],
        edges: [],
        variables: [],
        entities,
      };
      expect(getEntities(proj)).toBe(entities);
    });
  });

  describe("EntitySchema", () => {
    it("accepts valid character, location, and item entities", () => {
      expect(EntitySchema.safeParse({ id: "e1", kind: "character", name: "Alice" }).success).toBe(true);
      expect(EntitySchema.safeParse({ id: "e2", kind: "location", name: "Tavern", description: "A cozy place" }).success).toBe(true);
      expect(EntitySchema.safeParse({ id: "e3", kind: "item", name: "Rusty Sword" }).success).toBe(true);
    });

    it("rejects empty id, invalid kind, whitespace-only name, and name/desc exceeding limits", () => {
      expect(EntitySchema.safeParse({ id: "", kind: "character", name: "Alice" }).success).toBe(false);
      expect(EntitySchema.safeParse({ id: "e1", kind: "unknown", name: "Alice" }).success).toBe(false);
      expect(EntitySchema.safeParse({ id: "e1", kind: "character", name: "   " }).success).toBe(false);

      const tooLongName = "a".repeat(121);
      expect(EntitySchema.safeParse({ id: "e1", kind: "character", name: tooLongName }).success).toBe(false);

      const tooLongDesc = "a".repeat(5001);
      expect(EntitySchema.safeParse({ id: "e1", kind: "character", name: "Alice", description: tooLongDesc }).success).toBe(false);
    });
  });

  describe("FlowNodeSchema v2 additions", () => {
    it("accepts node with body and speakerId", () => {
      const parsed = FlowNodeSchema.safeParse({
        id: "n1",
        type: "scene",
        title: "Scene 1",
        body: "Once upon a time...",
        speakerId: "char_1",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects node with body exceeding 20,000 code points", () => {
      const longBody = "a".repeat(20001);
      const parsed = FlowNodeSchema.safeParse({
        id: "n1",
        type: "scene",
        title: "Scene 1",
        body: longBody,
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe("ProjectSchema v2 additions and caps", () => {
    it("accepts project with entities up to 1000", () => {
      const parsed = ProjectSchema.safeParse({
        id: "p1",
        name: "Test",
        nodes: [],
        edges: [],
        variables: [],
        entities: [{ id: "c1", kind: "character", name: "Alice" }],
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects project with > 1000 entities", () => {
      const entities = Array.from({ length: 1001 }, (_, i) => ({
        id: `e_${i}`,
        kind: "item" as const,
        name: `Item ${i}`,
      }));
      const parsed = ProjectSchema.safeParse({
        id: "p1",
        name: "Test",
        nodes: [],
        edges: [],
        variables: [],
        entities,
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe("Derived KNOWN_*_KEYS", () => {
    it("each equals the schema's real shape keys", () => {
      expect(Array.from(KNOWN_PROJECT_KEYS).sort()).toEqual(Object.keys(ProjectSchema.shape).sort());
      expect(Array.from(KNOWN_NODE_KEYS).sort()).toEqual(Object.keys(FlowNodeSchema.shape).sort());
      expect(Array.from(KNOWN_EDGE_KEYS).sort()).toEqual(Object.keys(FlowEdgeSchema.shape).sort());
      expect(Array.from(KNOWN_VARIABLE_KEYS).sort()).toEqual(Object.keys(VariableSchema.shape).sort());
      expect(Array.from(KNOWN_ENTITY_KEYS).sort()).toEqual(Object.keys(EntitySchema.shape).sort());
    });

    it("a v2 file using every new field yields ZERO unknown-property warnings", () => {
      const v2File = {
        format: "lumio-project",
        schemaVersion: 2,
        exportedAt: "2026-10-06T00:00:00.000Z",
        project: {
          id: "p1",
          name: "V2 Story",
          entities: [
            { id: "char-1", name: "Alice", kind: "character", description: "Hero" },
          ],
          nodes: [
            { id: "node-1", type: "start", title: "Start", body: "Hello", speakerId: "char-1" },
            { id: "node-2", type: "end", title: "End" },
          ],
          edges: [{ id: "edge-1", from: "node-1", to: "node-2" }],
          variables: [],
        },
      };

      const res = parseProjectFile(JSON.stringify(v2File));
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.warnings).toEqual([]);
      }
    });

    it("a genuinely unknown key still warns exactly as before", () => {
      const withUnknown = {
        format: "lumio-project",
        schemaVersion: 2,
        exportedAt: "2026-10-06T00:00:00.000Z",
        project: {
          id: "p1",
          name: "V2 Story",
          customUnknownProp: "warn me",
          entities: [{ id: "e1", name: "Alice", kind: "character", customEntityProp: 456 }],
          nodes: [
            { id: "node-1", type: "start", title: "Start", customNodeProp: 123 },
            { id: "node-2", type: "end", title: "End" },
          ],
          edges: [{ id: "edge-1", from: "node-1", to: "node-2", customEdgeProp: true }],
          variables: [{ id: "v1", name: "score", type: "number", initial: 0, customVarProp: "x" }],
        },
      };

      const res = parseProjectFile(JSON.stringify(withUnknown));
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.warnings.some((w) => w.includes("customUnknownProp"))).toBe(true);
        expect(res.warnings.some((w) => w.includes("customEntityProp"))).toBe(true);
        expect(res.warnings.some((w) => w.includes("customNodeProp"))).toBe(true);
        expect(res.warnings.some((w) => w.includes("customEdgeProp"))).toBe(true);
        expect(res.warnings.some((w) => w.includes("customVarProp"))).toBe(true);
      }
    });
  });

  describe("checkEntityAndSpeakerIntegrity", () => {
    it("detects duplicate entity IDs", () => {
      const proj: Project = {
        id: "p1",
        name: "Test",
        nodes: [],
        edges: [],
        variables: [],
        entities: [
          { id: "e1", kind: "character", name: "Alice" },
          { id: "e1", kind: "location", name: "Tavern" },
        ],
      };
      const errors = checkEntityAndSpeakerIntegrity(proj);
      expect(errors.some((e) => e.includes('Duplicate entity ID: "e1"'))).toBe(true);
    });

    it("detects speakerId referencing missing entity", () => {
      const proj: Project = {
        id: "p1",
        name: "Test",
        nodes: [{ id: "n1", type: "scene", title: "Scene", speakerId: "missing_char" }],
        edges: [],
        variables: [],
        entities: [],
      };
      const errors = checkEntityAndSpeakerIntegrity(proj);
      expect(errors.some((e) => e.includes('references missing speaker "missing_char"'))).toBe(true);
    });

    it("detects speakerId referencing an entity of non-character kind", () => {
      const proj: Project = {
        id: "p1",
        name: "Test",
        nodes: [{ id: "n1", type: "scene", title: "Scene", speakerId: "loc_1" }],
        edges: [],
        variables: [],
        entities: [{ id: "loc_1", kind: "location", name: "Forest" }],
      };
      const errors = checkEntityAndSpeakerIntegrity(proj);
      expect(errors.some((e) => e.includes('not a character'))).toBe(true);
    });
  });

  describe("Pure migrate function", () => {
    it("migrates v1 project by adding entities: []", () => {
      const v1Proj = {
        id: "p1",
        name: "Test v1",
        nodes: [{ id: "n1", type: "start", title: "Start" }],
        edges: [],
        variables: [],
      };
      const res = migrate(v1Proj, 1);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect((res.value as { entities: unknown }).entities).toEqual([]);
      }
    });

    it("returns v2 project as-is when fromVersion is 2", () => {
      const v2Proj = {
        id: "p2",
        name: "Test v2",
        nodes: [],
        edges: [],
        variables: [],
        entities: [{ id: "c1", kind: "character", name: "Bob" }],
      };
      const res = migrate(v2Proj, 2);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toBe(v2Proj);
      }
    });

    it("rejects unsupported versions without throwing", () => {
      for (const badVersion of [-1, 0, 3, "2", Number.NaN, null, undefined]) {
        const res = migrate({}, badVersion as number);
        expect(res.ok).toBe(false);
      }
    });

    it("migrates generated projects and validates as v2 (fast-check property)", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 50 }), (seed) => {
          const gen = generateBenchmarkProject({ seed, nodeCount: 10 });
          // Strip entities to simulate a v1 project
          const v1Proj: Record<string, unknown> = {
            id: gen.id,
            name: gen.name,
            nodes: gen.nodes,
            edges: gen.edges,
            variables: gen.variables,
          };
          const res = migrate(v1Proj, 1);
          expect(res.ok).toBe(true);
          if (res.ok) {
            const parsed = ProjectSchema.safeParse(res.value);
            expect(parsed.success).toBe(true);
            if (parsed.success) {
              expect(getEntities(parsed.data)).toEqual([]);
            }
          }
        }),
        { numRuns: 20 },
      );
    });
  });
});
