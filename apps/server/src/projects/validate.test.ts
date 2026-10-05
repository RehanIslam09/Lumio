import { describe, expect, it } from "vitest";
import {
  isWellFormedUnicode,
  SUPPORTED_SCHEMA_VERSION,
  validateProjectInput,
  walkTextSafety,
} from "./validate.js";

function makeMinimalProject(overrides?: Record<string, unknown>) {
  return {
    id: "proj-1",
    name: "Valid Project",
    nodes: [
      { id: "node-1", type: "start", title: "Start Node" },
      { id: "node-2", type: "end", title: "End Node" },
    ],
    edges: [
      { id: "edge-1", from: "node-1", to: "node-2" },
    ],
    variables: [
      { id: "var-1", name: "score", type: "number", initial: 0 },
    ],
    ...overrides,
  };
}

describe("isWellFormedUnicode", () => {
  it("accepts ASCII and normal UTF-8 strings", () => {
    expect(isWellFormedUnicode("hello world")).toBe(true);
    expect(isWellFormedUnicode("")).toBe(true);
    expect(isWellFormedUnicode("日本語")).toBe(true);
  });

  it("accepts valid surrogate pairs (emoji)", () => {
    expect(isWellFormedUnicode("🚀")).toBe(true);
    expect(isWellFormedUnicode("Hello 👋 world 🌍")).toBe(true);
  });

  it("rejects unpaired high surrogates", () => {
    expect(isWellFormedUnicode("bad \uD800 string")).toBe(false);
    expect(isWellFormedUnicode("\uD83D")).toBe(false);
  });

  it("rejects unpaired low surrogates", () => {
    expect(isWellFormedUnicode("bad \uDC00 string")).toBe(false);
    expect(isWellFormedUnicode("\uDE00")).toBe(false);
  });

  it("rejects inverted surrogate pairs", () => {
    expect(isWellFormedUnicode("\uDC00\uD83D")).toBe(false);
  });
});

describe("validateProjectInput", () => {
  describe("Rule 1: Envelope", () => {
    it("rejects non-object or null raw input", () => {
      const res1 = validateProjectInput(null, { requireBaseVersion: false });
      expect(res1.ok).toBe(false);
      if (!res1.ok) {
        expect(res1.code).toBe("invalid-request");
      }

      const res2 = validateProjectInput("string", { requireBaseVersion: false });
      expect(res2.ok).toBe(false);

      const res3 = validateProjectInput([], { requireBaseVersion: false });
      expect(res3.ok).toBe(false);
    });

    it("rejects missing, non-integer, or < 1 schemaVersion", () => {
      const doc = makeMinimalProject();
      expect(validateProjectInput({ document: doc }, { requireBaseVersion: false }).ok).toBe(false);
      expect(validateProjectInput({ schemaVersion: 0, document: doc }, { requireBaseVersion: false }).ok).toBe(false);
      expect(validateProjectInput({ schemaVersion: -1, document: doc }, { requireBaseVersion: false }).ok).toBe(false);
      expect(validateProjectInput({ schemaVersion: 1.5, document: doc }, { requireBaseVersion: false }).ok).toBe(false);
      expect(validateProjectInput({ schemaVersion: "1", document: doc }, { requireBaseVersion: false }).ok).toBe(false);
    });

    it("requires integer >= 1 baseVersion when requireBaseVersion: true", () => {
      const doc = makeMinimalProject();
      expect(validateProjectInput({ schemaVersion: 1, document: doc }, { requireBaseVersion: true }).ok).toBe(false);
      expect(validateProjectInput({ schemaVersion: 1, baseVersion: 0, document: doc }, { requireBaseVersion: true }).ok).toBe(false);
      expect(validateProjectInput({ schemaVersion: 1, baseVersion: -2, document: doc }, { requireBaseVersion: true }).ok).toBe(false);
      expect(validateProjectInput({ schemaVersion: 1, baseVersion: 1.5, document: doc }, { requireBaseVersion: true }).ok).toBe(false);
      expect(validateProjectInput({ schemaVersion: 1, baseVersion: "1", document: doc }, { requireBaseVersion: true }).ok).toBe(false);

      const valid = validateProjectInput({ schemaVersion: 1, baseVersion: 3, document: doc }, { requireBaseVersion: true });
      expect(valid.ok).toBe(true);
      if (valid.ok) {
        expect(valid.value.baseVersion).toBe(3);
      }
    });

    it("rejects non-object document", () => {
      expect(validateProjectInput({ schemaVersion: 1, document: "not an object" }, { requireBaseVersion: false }).ok).toBe(false);
      expect(validateProjectInput({ schemaVersion: 1, document: null }, { requireBaseVersion: false }).ok).toBe(false);
      expect(validateProjectInput({ schemaVersion: 1, document: [1, 2] }, { requireBaseVersion: false }).ok).toBe(false);
    });

    it("ignores extra envelope fields", () => {
      const doc = makeMinimalProject();
      const res = validateProjectInput(
        { schemaVersion: 1, document: doc, extraEnvelopeField: "ignore-me" },
        { requireBaseVersion: false }
      );
      expect(res.ok).toBe(true);
    });
  });

  describe("Rule 2: schemaVersion compatibility", () => {
    it("rejects schemaVersion !== SUPPORTED_SCHEMA_VERSION with code unsupported-schema-version", () => {
      const doc = makeMinimalProject();
      const res = validateProjectInput({ schemaVersion: 2, document: doc }, { requireBaseVersion: false });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("unsupported-schema-version");
        expect(res.supported).toBe(SUPPORTED_SCHEMA_VERSION);
      }
    });
  });

  describe("Rule 3: document parsed with ProjectSchema (strips unknown keys)", () => {
    it("strips unknown keys from document, nodes, edges, and variables", () => {
      const doc = {
        id: "proj-1",
        name: "Test Project",
        unknownRoot: "drop me",
        nodes: [
          { id: "node-1", type: "start", title: "Start", unknownNodeKey: 123 },
        ],
        edges: [
          { id: "edge-1", from: "node-1", to: "node-1", unknownEdgeKey: true },
        ],
        variables: [
          { id: "var-1", name: "v", type: "number", initial: 1, unknownVarKey: "abc" },
        ],
      };

      const res = validateProjectInput({ schemaVersion: 1, document: doc }, { requireBaseVersion: false });
      expect(res.ok).toBe(true);
      if (res.ok) {
        const stored = res.value.document as unknown as Record<string, unknown>;
        expect(stored["unknownRoot"]).toBeUndefined();
        const nodes = stored["nodes"] as Record<string, unknown>[];
        const edges = stored["edges"] as Record<string, unknown>[];
        const vars = stored["variables"] as Record<string, unknown>[];
        expect(nodes[0]?.["unknownNodeKey"]).toBeUndefined();
        expect(edges[0]?.["unknownEdgeKey"]).toBeUndefined();
        expect(vars[0]?.["unknownVarKey"]).toBeUndefined();
      }
    });

    it("rejects documents failing ProjectSchema with invalid-request", () => {
      const invalidDoc = {
        id: 123, // should be string
        name: "Test",
        nodes: "not an array",
      };
      const res = validateProjectInput({ schemaVersion: 1, document: invalidDoc }, { requireBaseVersion: false });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("invalid-request");
        expect(res.details.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Rule 4: Graph Integrity", () => {
    it("rejects duplicate node IDs", () => {
      const doc = makeMinimalProject({
        nodes: [
          { id: "dup-node", type: "start", title: "Start" },
          { id: "dup-node", type: "end", title: "End" },
        ],
      });
      const res = validateProjectInput({ schemaVersion: 1, document: doc }, { requireBaseVersion: false });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("invalid-request");
        expect(res.details.some((d) => d.message.includes('Duplicate node ID: "dup-node"'))).toBe(true);
      }
    });

    it("rejects duplicate edge IDs", () => {
      const doc = makeMinimalProject({
        edges: [
          { id: "dup-edge", from: "node-1", to: "node-2" },
          { id: "dup-edge", from: "node-2", to: "node-1" },
        ],
      });
      const res = validateProjectInput({ schemaVersion: 1, document: doc }, { requireBaseVersion: false });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("invalid-request");
        expect(res.details.some((d) => d.message.includes('Duplicate edge ID: "dup-edge"'))).toBe(true);
      }
    });

    it("rejects duplicate variable IDs", () => {
      const doc = makeMinimalProject({
        variables: [
          { id: "dup-var", name: "v1", type: "number", initial: 0 },
          { id: "dup-var", name: "v2", type: "number", initial: 1 },
        ],
      });
      const res = validateProjectInput({ schemaVersion: 1, document: doc }, { requireBaseVersion: false });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("invalid-request");
        expect(res.details.some((d) => d.message.includes('Duplicate variable ID: "dup-var"'))).toBe(true);
      }
    });

    it("rejects edge referencing nonexistent source or target node", () => {
      const doc = makeMinimalProject({
        edges: [
          { id: "edge-bad", from: "ghost-1", to: "ghost-2" },
        ],
      });
      const res = validateProjectInput({ schemaVersion: 1, document: doc }, { requireBaseVersion: false });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("invalid-request");
        expect(res.details.some((d) => d.message.includes('references missing source node "ghost-1"'))).toBe(true);
        expect(res.details.some((d) => d.message.includes('references missing target node "ghost-2"'))).toBe(true);
      }
    });

    it("caps details at 10 items", () => {
      const nodes = Array.from({ length: 15 }, (_, i) => ({
        id: `dup`,
        type: "scene" as const,
        title: `Scene ${i}`,
      }));
      const doc = makeMinimalProject({ nodes });
      const res = validateProjectInput({ schemaVersion: 1, document: doc }, { requireBaseVersion: false });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.details.length).toBeLessThanOrEqual(10);
      }
    });
  });

  describe("Rule 5: Text Safety", () => {
    it("rejects U+0000 in a string value without echoing content", () => {
      const doc = makeMinimalProject({
        nodes: [
          { id: "node-1", type: "start", title: "Null\u0000ByteSecret" },
          { id: "node-2", type: "end", title: "End" },
        ],
      });
      const res = validateProjectInput({ schemaVersion: 1, document: doc }, { requireBaseVersion: false });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("invalid-request");
        expect(res.details.some((d) => d.path.includes("nodes[0].title"))).toBe(true);
        // Ensure secret content is not echoed
        for (const d of res.details) {
          expect(d.message).not.toContain("Secret");
          expect(d.message).not.toContain("\u0000");
        }
      }
    });

    it("rejects U+0000 in project name without echoing content", () => {
      const doc = makeMinimalProject({
        name: "MyProject\u0000Secret",
      });
      const res = validateProjectInput({ schemaVersion: 1, document: doc }, { requireBaseVersion: false });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("invalid-request");
        expect(res.details.some((d) => d.path.includes("name"))).toBe(true);
        expect(res.details[0]?.message).not.toContain("Secret");
      }
    });

    it("rejects lone surrogate in project name without echoing content", () => {
      const doc = makeMinimalProject({
        name: "MyProject\uD800Secret",
      });
      const res = validateProjectInput({ schemaVersion: 1, document: doc }, { requireBaseVersion: false });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("invalid-request");
        expect(res.details.some((d) => d.path.includes("name"))).toBe(true);
        expect(res.details[0]?.message).not.toContain("Secret");
      }
    });

    it("walkTextSafety detects U+0000 and lone surrogates in object keys", () => {
      const badKeyObj = {
        "bad\u0000key": "val",
        "bad\uD800key": "val2",
      };
      const details = walkTextSafety(badKeyObj, "custom");
      expect(details.length).toBeGreaterThan(0);
      expect(details.some((d) => d.message.includes("Object key contains disallowed null byte"))).toBe(true);
      expect(details.some((d) => d.message.includes("Object key contains invalid Unicode"))).toBe(true);
    });

    it("walkTextSafety handles 100_000-level nested structure without stack overflow", () => {
      let deep: Record<string, unknown> = { leaf: "safe" };
      for (let i = 0; i < 100_000; i++) {
        deep = { child: deep };
      }
      const details = walkTextSafety(deep, "deep");
      expect(details).toEqual([]);
    });
  });

  describe("Rule 6: Name validation", () => {
    it("rejects whitespace-only name", () => {
      const doc = makeMinimalProject({ name: "   \t\n  " });
      const res = validateProjectInput({ schemaVersion: 1, document: doc }, { requireBaseVersion: false });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("invalid-request");
        expect(res.details.some((d) => d.path === "document.name")).toBe(true);
      }
    });

    it("accepts exactly 200 code points with multi-byte emoji", () => {
      // 199 ASCII 'a's + 1 emoji '🌟' = 200 code points (201 UTF-16 units)
      const name200 = "a".repeat(199) + "🌟";
      expect(Array.from(name200).length).toBe(200);
      expect(name200.length).toBe(201); // 201 UTF-16 code units

      const doc = makeMinimalProject({ name: name200 });
      const res = validateProjectInput({ schemaVersion: 1, document: doc }, { requireBaseVersion: false });
      expect(res.ok).toBe(true);
    });

    it("rejects 201 code points with multi-byte emoji", () => {
      // 200 ASCII 'a's + 1 emoji '🌟' = 201 code points
      const name201 = "a".repeat(200) + "🌟";
      expect(Array.from(name201).length).toBe(201);

      const doc = makeMinimalProject({ name: name201 });
      const res = validateProjectInput({ schemaVersion: 1, document: doc }, { requireBaseVersion: false });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("invalid-request");
        expect(res.details.some((d) => d.path === "document.name")).toBe(true);
        // Error must not echo name
        expect(res.details[0]?.message).not.toContain(name201);
      }
    });
  });
});
