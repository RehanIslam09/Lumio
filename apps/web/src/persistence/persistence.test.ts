import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import type { Project, FlowNode } from "@repo/schema";
import { getSampleProjectWithSyntaxError } from "../demo/sampleProject.js";
import { createEditor, apply, undo, type EditorAction } from "../editor/index.js";
import {
  serializeProject,
  parseProjectFile,
  checkFileSizeBytes,
  fileNameFor,
  isDirty,
  makeEmptyProject,
  MAX_FILE_BYTES,
  CURRENT_SCHEMA_VERSION,
  PROJECT_FORMAT,
} from "./index.js";

describe("serializeProject", () => {
  it("serializes project deterministically with 2-space indentation and trailing newline", () => {
    const project = getSampleProjectWithSyntaxError(false);
    const date = "2026-10-04T12:00:00.000Z";
    const s1 = serializeProject(project, date);
    const s2 = serializeProject(project, date);

    expect(s1).toBe(s2);
    expect(s1.endsWith("\n")).toBe(true);

    const parsed = JSON.parse(s1) as Record<string, unknown>;
    expect(parsed.format).toBe(PROJECT_FORMAT);
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.exportedAt).toBe(date);
    expect(parsed.project).toEqual(project);
  });
});

describe("fileNameFor", () => {
  it("converts spaces and non-alphanumeric chars to single '-' without leading/trailing dashes", () => {
    expect(fileNameFor("My Quest Story!")).toBe("my-quest-story.lumio.json");
    expect(fileNameFor("   Leading and Trailing   ")).toBe("leading-and-trailing.lumio.json");
    expect(fileNameFor("Special --- Characters ### Here")).toBe("special-characters-here.lumio.json");
  });

  it("drops non-ASCII characters without transliterating", () => {
    expect(fileNameFor("Quest Über 10")).toBe("quest-ber-10.lumio.json");
    expect(fileNameFor("日本語タイトル")).toBe("project.lumio.json");
  });

  it("falls back to 'project.lumio.json' when result is empty", () => {
    expect(fileNameFor("")).toBe("project.lumio.json");
    expect(fileNameFor("   ")).toBe("project.lumio.json");
    expect(fileNameFor("!@#$%^&*()")).toBe("project.lumio.json");
  });

  it("truncates slug to 60 characters before the extension", () => {
    const longName = "a".repeat(80);
    const res = fileNameFor(longName);
    expect(res).toBe(`${"a".repeat(60)}.lumio.json`);
    expect(res.replace(".lumio.json", "").length).toBe(60);
  });
});

describe("isDirty", () => {
  it("is false when present matches saved reference and true when modified", () => {
    const initial = getSampleProjectWithSyntaxError(false);
    let state = createEditor(initial);
    const saved = state.present;

    expect(isDirty(state, saved)).toBe(false);

    // Apply an action
    const newNode: FlowNode = { id: "node_custom", title: "New", type: "scene" };
    const res = apply(state, { type: "addNode", node: newNode });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    state = res.state;

    expect(isDirty(state, saved)).toBe(true);

    // Undo back to saved state: structural sharing restores identical reference
    state = undo(state);
    expect(isDirty(state, saved)).toBe(false);
    expect(state.present).toBe(saved);
  });
});

describe("makeEmptyProject", () => {
  it("creates a valid minimal project with single start node and no edges/variables", () => {
    const empty = makeEmptyProject("proj_empty", "Empty Story");
    expect(empty.id).toBe("proj_empty");
    expect(empty.name).toBe("Empty Story");
    expect(empty.nodes).toEqual([{ id: "node_1", title: "Start", type: "start" }]);
    expect(empty.edges).toEqual([]);
    expect(empty.variables).toEqual([]);

    // Round-trip parse to confirm schema validity
    const serialized = serializeProject(empty, "2026-10-04T00:00:00.000Z");
    const parsed = parseProjectFile(serialized);
    expect(parsed.ok).toBe(true);
  });
});

describe("parseProjectFile - Error Codes & Edge Cases", () => {
  it("returns 'too-large' error if file size exceeds MAX_FILE_BYTES", () => {
    // Exactly at MAX_FILE_BYTES passes size check (though may fail JSON parse)
    const exactlyMaxAscii = " ".repeat(MAX_FILE_BYTES);
    const resExact = parseProjectFile(exactlyMaxAscii);
    expect(resExact.ok).toBe(false);
    if (!resExact.ok) {
      expect(resExact.error.code).toBe("not-json");
    }

    // 1 byte over fails size check
    const overAscii = " ".repeat(MAX_FILE_BYTES + 1);
    const resOver = parseProjectFile(overAscii);
    expect(resOver.ok).toBe(false);
    if (!resOver.ok) {
      expect(resOver.error.code).toBe("too-large");
      expect(resOver.error.message).toContain("exceeds maximum allowed size");
    }

    // Multi-byte character counts bytes, not chars
    // '€' is 3 bytes in UTF-8
    const chars = Math.floor(MAX_FILE_BYTES / 3) + 1;
    const multiByteText = "€".repeat(chars);
    const resMulti = parseProjectFile(multiByteText);
    expect(resMulti.ok).toBe(false);
    if (!resMulti.ok) {
      expect(resMulti.error.code).toBe("too-large");
    }
  });

  it("checkFileSizeBytes helper returns identical 'too-large' error", () => {
    const resUnder = checkFileSizeBytes(MAX_FILE_BYTES);
    expect(resUnder).toBeNull();

    const resOver = checkFileSizeBytes(MAX_FILE_BYTES + 1);
    expect(resOver).not.toBeNull();
    expect(resOver?.ok).toBe(false);
    if (resOver && !resOver.ok) {
      expect(resOver.error.code).toBe("too-large");
      expect(resOver.error.message).toContain("exceeds maximum allowed size");
    }
  });

  it("returns 'not-json' error on invalid JSON syntax", () => {
    const res = parseProjectFile("{ format: 'lumio-project' unquoted }");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("not-json");
      expect(res.error.message).toContain("JSON");
    }
  });

  it("returns 'wrong-format' if not an object or format is wrong", () => {
    expect(parseProjectFile("null")).toEqual({
      ok: false,
      error: { code: "wrong-format", message: "File content is not a JSON object", details: [] },
    });
    expect(parseProjectFile("[1, 2, 3]")).toEqual({
      ok: false,
      error: { code: "wrong-format", message: "File content is not a JSON object", details: [] },
    });
    expect(parseProjectFile(JSON.stringify({ format: "other-format", schemaVersion: 1 }))).toEqual({
      ok: false,
      error: {
        code: "wrong-format",
        message: 'Invalid format marker (expected "lumio-project")',
        details: [],
      },
    });
    expect(parseProjectFile(JSON.stringify({ format: "lumio-project", schemaVersion: 0 }))).toEqual({
      ok: false,
      error: {
        code: "wrong-format",
        message: "Invalid schema version (expected positive integer)",
        details: [],
      },
    });
    expect(parseProjectFile(JSON.stringify({ format: "lumio-project", schemaVersion: "1" }))).toEqual({
      ok: false,
      error: {
        code: "wrong-format",
        message: "Invalid schema version (expected positive integer)",
        details: [],
      },
    });
  });

  it("returns 'unsupported-version' with helpful message when schemaVersion > CURRENT_SCHEMA_VERSION", () => {
    const file = {
      format: "lumio-project",
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      exportedAt: "2026-10-04T00:00:00.000Z",
      project: makeEmptyProject("p1", "Future"),
    };
    const res = parseProjectFile(JSON.stringify(file));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("unsupported-version");
      expect(res.error.message).toContain("newer version");
    }
  });

  it("returns 'invalid-project' with at most 10 dot-joined path details when schema fails", () => {
    const invalidProject = {
      id: 123, // invalid type
      name: "Bad",
      nodes: Array.from({ length: 15 }, (_, i) => ({
        id: `node_${i}`,
        type: "invalid_type",
        title: "Test",
      })),
      edges: "not-an-array",
      variables: [],
    };
    const file = {
      format: "lumio-project",
      schemaVersion: 1,
      exportedAt: "2026-10-04T00:00:00.000Z",
      project: invalidProject,
    };
    const res = parseProjectFile(JSON.stringify(file));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("invalid-project");
      expect(res.error.details.length).toBeLessThanOrEqual(11); // 10 details + "...and N more"
      expect(res.error.details.some((d) => d.startsWith("nodes."))).toBe(true);
      expect(res.error.details[res.error.details.length - 1]).toMatch(/\.\.\.and \d+ more/);
    }
  });

  it("returns 'integrity' error when node/edge/variable IDs collide or edges point to missing nodes", () => {
    const projectWithCollisions = {
      id: "p1",
      name: "Collision",
      nodes: [
        { id: "dup_node", title: "Node 1", type: "start" },
        { id: "dup_node", title: "Node 2", type: "scene" },
      ],
      edges: [
        { id: "dup_edge", from: "dup_node", to: "dup_node" },
        { id: "dup_edge", from: "dup_node", to: "missing_target" },
      ],
      variables: [
        { id: "dup_var", name: "v1", type: "number" },
        { id: "dup_var", name: "v2", type: "string" },
      ],
    };
    const file = {
      format: "lumio-project",
      schemaVersion: 1,
      exportedAt: "2026-10-04T00:00:00.000Z",
      project: projectWithCollisions,
    };
    const res = parseProjectFile(JSON.stringify(file));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("integrity");
      expect(res.error.details).toContain('Duplicate node ID: "dup_node"');
      expect(res.error.details).toContain('Duplicate edge ID: "dup_edge"');
      expect(res.error.details).toContain('Duplicate variable ID: "dup_var"');
      expect(res.error.details).toContain(
        'Edge "dup_edge" references missing target node "missing_target"',
      );
    }
  });

  it("does NOT reject duplicate variable names (checker handles them)", () => {
    const project = {
      id: "p1",
      name: "Duplicate Var Names",
      nodes: [{ id: "n1", title: "Start", type: "start" }],
      edges: [],
      variables: [
        { id: "var_1", name: "score", type: "number" },
        { id: "var_2", name: "score", type: "number" },
      ],
    };
    const serialized = serializeProject(project as Project, "2026-10-04T00:00:00.000Z");
    const res = parseProjectFile(serialized);
    expect(res.ok).toBe(true);
  });

  it("detects stripped unknown project properties and adds warnings", () => {
    const rawFile = {
      format: "lumio-project",
      schemaVersion: 1,
      exportedAt: "2026-10-04T00:00:00.000Z",
      project: {
        id: "p1",
        name: "Test",
        nodes: [{ id: "n1", title: "Start", type: "start", extraNodeProp: "strip-me" }],
        edges: [],
        variables: [],
        customPluginData: { foo: "bar" },
      },
      fileMetadata: "extra-metadata",
    };
    const res = parseProjectFile(JSON.stringify(rawFile));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.warnings.length).toBeGreaterThan(0);
      expect(res.warnings.some((w) => w.includes("customPluginData") || w.includes("extraNodeProp"))).toBe(true);
    }
  });
});

describe("Property Tests", () => {
  it("F1 (round trip): parse(serialize(p)) deep-equals p for projects produced by random valid editor actions", () => {
    const baseProject = getSampleProjectWithSyntaxError(false);

    type F1Intent =
      | { kind: "addNode"; idSuffix: number; title: string; nodeType: "scene" | "start" | "end" }
      | { kind: "renameProject"; name: string }
      | { kind: "updateNode"; nodeIndexPick: number; title: string }
      | { kind: "deleteEdge"; edgeIndexPick: number }
      | { kind: "deleteVariable"; varIndexPick: number };

    const intentArb: fc.Arbitrary<F1Intent> = fc.oneof(
      fc.record({
        kind: fc.constant("addNode" as const),
        idSuffix: fc.integer({ min: 100, max: 999 }),
        title: fc.string({ maxLength: 20 }),
        nodeType: fc.constantFrom("scene" as const, "start" as const, "end" as const),
      }),
      fc.record({
        kind: fc.constant("renameProject" as const),
        name: fc.string({ maxLength: 30 }),
      }),
      fc.record({
        kind: fc.constant("updateNode" as const),
        nodeIndexPick: fc.nat({ max: 50 }),
        title: fc.string({ maxLength: 20 }),
      }),
      fc.record({
        kind: fc.constant("deleteEdge" as const),
        edgeIndexPick: fc.nat({ max: 50 }),
      }),
      fc.record({
        kind: fc.constant("deleteVariable" as const),
        varIndexPick: fc.nat({ max: 50 }),
      }),
    );

    const resolveIntent = (project: Project, intent: F1Intent): EditorAction => {
      switch (intent.kind) {
        case "addNode":
          return {
            type: "addNode",
            node: {
              id: `node_f1_${intent.idSuffix}`,
              title: intent.title,
              type: intent.nodeType,
            },
          };
        case "renameProject":
          return {
            type: "renameProject",
            name: intent.name,
          };
        case "updateNode": {
          const target = project.nodes[intent.nodeIndexPick % project.nodes.length];
          if (!target) {
            return { type: "updateNode", id: "missing", patch: { title: intent.title } };
          }
          return {
            type: "updateNode",
            id: target.id,
            patch: { title: intent.title },
          };
        }
        case "deleteEdge": {
          const target = project.edges[intent.edgeIndexPick % project.edges.length];
          if (!target) {
            return { type: "deleteEdge", id: "missing" };
          }
          return {
            type: "deleteEdge",
            id: target.id,
          };
        }
        case "deleteVariable": {
          const target = project.variables[intent.varIndexPick % project.variables.length];
          if (!target) {
            return { type: "deleteVariable", id: "missing" };
          }
          return {
            type: "deleteVariable",
            id: target.id,
          };
        }
      }
    };

    let acceptedCount = 0;
    let rejectedCount = 0;
    let noopCount = 0;

    fc.assert(
      fc.property(fc.array(intentArb, { minLength: 1, maxLength: 8 }), (intents) => {
        let state = createEditor(baseProject);
        for (const intent of intents) {
          const action = resolveIntent(state.present, intent);
          const res = apply(state, action);
          if (res.ok) {
            if (res.state.present === state.present) {
              noopCount++;
            } else {
              acceptedCount++;
              state = res.state;
            }
          } else {
            rejectedCount++;
          }
        }

        const project = state.present;
        const serialized = serializeProject(project, "2026-10-04T12:00:00.000Z");
        const parsed = parseProjectFile(serialized);

        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
          expect(parsed.project).toEqual(project);
        }
      }),
      { numRuns: 25 },
    );

    const totalIntents = acceptedCount + rejectedCount + noopCount;
    const acceptedPct = (acceptedCount / totalIntents) * 100;
    const rejectedPct = (rejectedCount / totalIntents) * 100;
    const noopPct = (noopCount / totalIntents) * 100;

    console.log(
      `F1 distribution: accepted=${acceptedPct.toFixed(1)}% (${acceptedCount}), rejected=${rejectedPct.toFixed(1)}% (${rejectedCount}), noop=${noopPct.toFixed(1)}% (${noopCount}), total=${totalIntents}`,
    );

    expect(acceptedCount / totalIntents).toBeGreaterThanOrEqual(0.1);
  });

  it("F2 (robustness): parseProjectFile never throws and returns well-formed result on arbitrary and mutated strings", () => {
    const validSample = serializeProject(getSampleProjectWithSyntaxError(false), "2026-10-04T12:00:00.000Z");

    // Mutation generator: insert, delete, or flip character
    const mutateString = (str: string, seed: number): string => {
      if (str.length === 0) return "{}";
      const idx = seed % str.length;
      const op = seed % 3;
      if (op === 0) {
        // delete char
        return str.slice(0, idx) + str.slice(idx + 1);
      } else if (op === 1) {
        // flip char
        const charCode = str.charCodeAt(idx);
        return str.slice(0, idx) + String.fromCharCode((charCode + 1) % 128) + str.slice(idx + 1);
      } else {
        // insert char
        return str.slice(0, idx) + "X" + str.slice(idx);
      }
    };

    // 1. Arbitrary strings
    fc.assert(
      fc.property(fc.string({ maxLength: 1000 }), (rawString) => {
        const res = parseProjectFile(rawString);
        expect(typeof res.ok).toBe("boolean");
        if (!res.ok) {
          expect(["too-large", "not-json", "wrong-format", "unsupported-version", "invalid-project", "integrity"]).toContain(
            res.error.code,
          );
          expect(typeof res.error.message).toBe("string");
          expect(Array.isArray(res.error.details)).toBe(true);
        } else {
          expect(res.project).toBeDefined();
          expect(Array.isArray(res.warnings)).toBe(true);
        }
      }),
      { numRuns: 50 },
    );

    // 2. Mutated valid serialized project
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (seed) => {
        const mutated = mutateString(validSample, seed);
        const res = parseProjectFile(mutated);
        expect(typeof res.ok).toBe("boolean");
        if (!res.ok) {
          expect(typeof res.error.message).toBe("string");
        }
      }),
      { numRuns: 50 },
    );
  });
});
