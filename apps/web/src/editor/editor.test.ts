import { describe, it, expect } from "vitest";
import type { Project, FlowNode, FlowEdge, Variable } from "@repo/schema";
import {
  createEditor,
  apply,
  undo,
  redo,
  canUndo,
  canRedo,
  nextId,
} from "./index";

function makeInitialProject(): Project {
  return {
    id: "proj_test",
    name: "Initial Project",
    nodes: [
      { id: "node_start", type: "start", title: "Start Node" },
      { id: "node_scene_1", type: "scene", title: "Scene 1", position: { x: 100, y: 200 } },
      { id: "node_end", type: "end", title: "End Node" },
    ],
    edges: [
      {
        id: "edge_1",
        from: "node_start",
        to: "node_scene_1",
        condition: "var_a > 0",
        effects: ["var_a = 5"],
      },
      {
        id: "edge_2",
        from: "node_scene_1",
        to: "node_end",
      },
    ],
    variables: [
      { id: "var_1", name: "var_a", type: "number", initial: 1 },
      { id: "var_2", name: "var_b", type: "string", initial: "hello" },
    ],
  };
}

describe("nextId", () => {
  it("handles empty lists", () => {
    expect(nextId([], "node")).toBe("node_1");
  });

  it("handles contiguous IDs", () => {
    expect(nextId(["node_1", "node_2"], "node")).toBe("node_3");
  });

  it("fills the smallest available gap", () => {
    expect(nextId(["node_1", "node_3"], "node")).toBe("node_2");
    expect(nextId(["node_2", "node_3"], "node")).toBe("node_1");
  });

  it("ignores IDs with different prefixes or non-numeric suffixes", () => {
    expect(nextId(["edge_1", "other_prefix_2", "node_custom", "node_0"], "node")).toBe("node_1");
    expect(nextId(["node_1", "node_text", "node_01"], "node")).toBe("node_2");
  });
});

describe("createEditor and history basics", () => {
  it("initializes with empty past and future", () => {
    const proj = makeInitialProject();
    const state = createEditor(proj);
    expect(state.present).toBe(proj);
    expect(state.past).toEqual([]);
    expect(state.future).toEqual([]);
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
  });

  it("undo and redo on empty history return the exact same state reference", () => {
    const state = createEditor(makeInitialProject());
    expect(Object.is(undo(state), state)).toBe(true);
    expect(Object.is(redo(state), state)).toBe(true);
  });
});

describe("action success paths", () => {
  it("renameProject succeeds and pushes history", () => {
    const state = createEditor(makeInitialProject());
    const res = apply(state, { type: "renameProject", name: "Renamed Project" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.state.present.name).toBe("Renamed Project");
    expect(res.state.past.length).toBe(1);
    expect(res.state.past[0]).toBe(state.present);
    expect(res.state.future).toEqual([]);
    expect(canUndo(res.state)).toBe(true);
    expect(canRedo(res.state)).toBe(false);
  });

  it("addNode succeeds", () => {
    const state = createEditor(makeInitialProject());
    const newNode: FlowNode = { id: "node_scene_2", type: "scene", title: "Scene 2" };
    const res = apply(state, { type: "addNode", node: newNode });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.state.present.nodes.length).toBe(4);
    expect(res.state.present.nodes[3]).toEqual(newNode);
    expect(res.state.present.edges).toBe(state.present.edges);
    expect(res.state.present.variables).toBe(state.present.variables);
  });

  it("updateNode succeeds and maintains structural sharing", () => {
    const state = createEditor(makeInitialProject());
    const res = apply(state, {
      type: "updateNode",
      id: "node_scene_1",
      patch: { title: "Updated Scene 1", position: { x: 150, y: 250 } },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const updatedNode = res.state.present.nodes.find((n) => n.id === "node_scene_1");
    expect(updatedNode?.title).toBe("Updated Scene 1");
    expect(updatedNode?.position).toEqual({ x: 150, y: 250 });

    // Untouched nodes, edges, and variables preserve references
    expect(Object.is(res.state.present.nodes[0], state.present.nodes[0])).toBe(true);
    expect(Object.is(res.state.present.nodes[2], state.present.nodes[2])).toBe(true);
    expect(Object.is(res.state.present.edges, state.present.edges)).toBe(true);
    expect(Object.is(res.state.present.variables, state.present.variables)).toBe(true);
  });

  it("moveNode updates position", () => {
    const state = createEditor(makeInitialProject());
    const res = apply(state, {
      type: "moveNode",
      id: "node_start",
      position: { x: 50, y: 60 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const moved = res.state.present.nodes.find((n) => n.id === "node_start");
    expect(moved?.position).toEqual({ x: 50, y: 60 });
  });

  it("deleteNode removes node and cascades to incident edges in one history step", () => {
    const state = createEditor(makeInitialProject());
    // node_scene_1 has edge_1 (incoming) and edge_2 (outgoing)
    const res = apply(state, { type: "deleteNode", id: "node_scene_1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.state.present.nodes.map((n) => n.id)).toEqual(["node_start", "node_end"]);
    expect(res.state.present.edges).toEqual([]);

    // ONE undo restores both node and incident edges
    const undone = undo(res.state);
    expect(undone.present).toBe(state.present);
    expect(undone.present.nodes.length).toBe(3);
    expect(undone.present.edges.length).toBe(2);
  });

  it("addEdge succeeds (including self-loops and parallel edges)", () => {
    const state = createEditor(makeInitialProject());
    const selfEdge: FlowEdge = { id: "edge_self", from: "node_start", to: "node_start" };
    const res1 = apply(state, { type: "addEdge", edge: selfEdge });
    expect(res1.ok).toBe(true);
    if (!res1.ok) return;

    const parallelEdge: FlowEdge = { id: "edge_parallel", from: "node_start", to: "node_scene_1" };
    const res2 = apply(res1.state, { type: "addEdge", edge: parallelEdge });
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;

    expect(res2.state.present.edges.length).toBe(4);
  });

  it("updateEdge succeeds", () => {
    const state = createEditor(makeInitialProject());
    const res = apply(state, {
      type: "updateEdge",
      id: "edge_1",
      patch: { condition: "var_a > 10", effects: ["var_a = 20"] },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const updated = res.state.present.edges.find((e) => e.id === "edge_1");
    expect(updated?.condition).toBe("var_a > 10");
    expect(updated?.effects).toEqual(["var_a = 20"]);
  });

  it("deleteEdge succeeds", () => {
    const state = createEditor(makeInitialProject());
    const res = apply(state, { type: "deleteEdge", id: "edge_1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.state.present.edges.map((e) => e.id)).toEqual(["edge_2"]);
  });

  it("addVariable, updateVariable, and deleteVariable succeed", () => {
    const state = createEditor(makeInitialProject());
    const newVar: Variable = { id: "var_3", name: "var_c", type: "boolean", initial: true };
    const res1 = apply(state, { type: "addVariable", variable: newVar });
    expect(res1.ok).toBe(true);
    if (!res1.ok) return;
    expect(res1.state.present.variables.length).toBe(3);

    const res2 = apply(res1.state, {
      type: "updateVariable",
      id: "var_3",
      patch: { initial: false },
    });
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;
    expect(res2.state.present.variables.find((v) => v.id === "var_3")?.initial).toBe(false);

    const res3 = apply(res2.state, { type: "deleteVariable", id: "var_3" });
    expect(res3.ok).toBe(true);
    if (!res3.ok) return;
    expect(res3.state.present.variables.length).toBe(2);
  });

  it("updateVariable changing type with mismatching initial returns invalid unless patched with matching initial or null", () => {
    const state = createEditor(makeInitialProject());
    // var_1 has type: "number", initial: 1

    // 1. Changing type without matching initial -> invalid
    const resMismatched = apply(state, {
      type: "updateVariable",
      id: "var_1",
      patch: { type: "string" },
    });
    expect(resMismatched.ok).toBe(false);
    if (!resMismatched.ok) {
      expect(resMismatched.error.code).toBe("invalid");
    }

    // 2. Changing type with matching new initial -> succeeds
    const resMatching = apply(state, {
      type: "updateVariable",
      id: "var_1",
      patch: { type: "string", initial: "now_valid" },
    });
    expect(resMatching.ok).toBe(true);
    if (resMatching.ok) {
      const v = resMatching.state.present.variables.find((item) => item.id === "var_1");
      expect(v?.type).toBe("string");
      expect(v?.initial).toBe("now_valid");
    }

    // 3. Changing type with initial: null -> succeeds (removes initial)
    const resNull = apply(state, {
      type: "updateVariable",
      id: "var_1",
      patch: { type: "string", initial: null },
    });
    expect(resNull.ok).toBe(true);
    if (resNull.ok) {
      const v = resNull.state.present.variables.find((item) => item.id === "var_1");
      expect(v?.type).toBe("string");
      expect("initial" in (v as unknown as Record<string, unknown>)).toBe(false);
      expect(v?.initial).toBeUndefined();
    }
  });
});

describe("null patch values remove fields", () => {
  it("updateNode with position: null removes position key", () => {
    const state = createEditor(makeInitialProject());
    const res = apply(state, {
      type: "updateNode",
      id: "node_scene_1",
      patch: { position: null },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const node = res.state.present.nodes.find((n) => n.id === "node_scene_1");
    expect(node).toBeDefined();
    expect("position" in (node as unknown as Record<string, unknown>)).toBe(false);
    expect(node?.position).toBeUndefined();
  });

  it("updateEdge with condition: null and effects: null removes keys", () => {
    const state = createEditor(makeInitialProject());
    const res = apply(state, {
      type: "updateEdge",
      id: "edge_1",
      patch: { condition: null, effects: null },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const edge = res.state.present.edges.find((e) => e.id === "edge_1");
    expect(edge).toBeDefined();
    expect("condition" in (edge as unknown as Record<string, unknown>)).toBe(false);
    expect("effects" in (edge as unknown as Record<string, unknown>)).toBe(false);
  });

  it("updateVariable with initial: null removes initial key", () => {
    const state = createEditor(makeInitialProject());
    const res = apply(state, {
      type: "updateVariable",
      id: "var_1",
      patch: { initial: null },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const v = res.state.present.variables.find((item) => item.id === "var_1");
    expect(v).toBeDefined();
    expect("initial" in (v as unknown as Record<string, unknown>)).toBe(false);
    expect(v?.initial).toBeUndefined();
  });
});

describe("error handling for all error codes", () => {
  it("reports 'not-found' on missing entities", () => {
    const state = createEditor(makeInitialProject());

    const r1 = apply(state, { type: "updateNode", id: "missing", patch: { title: "x" } });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe("not-found");

    const r2 = apply(state, { type: "moveNode", id: "missing", position: { x: 0, y: 0 } });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("not-found");

    const r3 = apply(state, { type: "deleteNode", id: "missing" });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error.code).toBe("not-found");

    const r4 = apply(state, { type: "updateEdge", id: "missing", patch: { condition: "true" } });
    expect(r4.ok).toBe(false);
    if (!r4.ok) expect(r4.error.code).toBe("not-found");

    const r5 = apply(state, { type: "deleteEdge", id: "missing" });
    expect(r5.ok).toBe(false);
    if (!r5.ok) expect(r5.error.code).toBe("not-found");

    const r6 = apply(state, { type: "updateVariable", id: "missing", patch: { name: "v" } });
    expect(r6.ok).toBe(false);
    if (!r6.ok) expect(r6.error.code).toBe("not-found");

    const r7 = apply(state, { type: "deleteVariable", id: "missing" });
    expect(r7.ok).toBe(false);
    if (!r7.ok) expect(r7.error.code).toBe("not-found");
  });

  it("reports 'duplicate-id' on adding an existing id", () => {
    const state = createEditor(makeInitialProject());

    const r1 = apply(state, {
      type: "addNode",
      node: { id: "node_start", type: "scene", title: "Duplicate" },
    });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe("duplicate-id");

    const r2 = apply(state, {
      type: "addEdge",
      edge: { id: "edge_1", from: "node_start", to: "node_end" },
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("duplicate-id");

    const r3 = apply(state, {
      type: "addVariable",
      variable: { id: "var_1", name: "other_name", type: "number" },
    });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error.code).toBe("duplicate-id");
  });

  it("reports 'dangling-reference' for missing edge endpoints", () => {
    const state = createEditor(makeInitialProject());

    const r1 = apply(state, {
      type: "addEdge",
      edge: { id: "edge_dangling", from: "missing_node", to: "node_end" },
    });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe("dangling-reference");

    const r2 = apply(state, {
      type: "addEdge",
      edge: { id: "edge_dangling", from: "node_start", to: "missing_node" },
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("dangling-reference");

    const r3 = apply(state, {
      type: "updateEdge",
      id: "edge_1",
      patch: { to: "missing_node" },
    });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error.code).toBe("dangling-reference");
  });

  it("reports 'invalid' for schema validation failures", () => {
    const state = createEditor(makeInitialProject());

    // Non-finite position
    const r1 = apply(state, {
      type: "moveNode",
      id: "node_start",
      position: { x: Infinity, y: 0 },
    });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe("invalid");

    // Invalid node type
    const r2 = apply(state, {
      type: "updateNode",
      id: "node_start",
      patch: { type: "invalid_type" as unknown as FlowNode["type"] },
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("invalid");

    // Invalid variable name ('true' is reserved)
    const r3 = apply(state, {
      type: "addVariable",
      variable: { id: "var_bad", name: "true", type: "boolean" },
    });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error.code).toBe("invalid");

    // Variable type change with mismatching existing initial value
    // var_1 has type: "number", initial: 1. Changing type to "string" without patch.initial makes initial invalid
    const r4 = apply(state, {
      type: "updateVariable",
      id: "var_1",
      patch: { type: "string" },
    });
    expect(r4.ok).toBe(false);
    if (!r4.ok) expect(r4.error.code).toBe("invalid");
  });
});

describe("no-op detection", () => {
  it("returns ok:true with the EXACT same state reference and no history push", () => {
    const state = createEditor(makeInitialProject());

    const r1 = apply(state, { type: "renameProject", name: "Initial Project" });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(Object.is(r1.state, state)).toBe(true);
    expect(r1.state.past.length).toBe(0);

    const r2 = apply(state, {
      type: "updateNode",
      id: "node_start",
      patch: { title: "Start Node" },
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(Object.is(r2.state, state)).toBe(true);
    expect(r2.state.past.length).toBe(0);
  });
});

describe("history behavior and cap", () => {
  it("caps past at 100 entries and drops the oldest state", () => {
    let state = createEditor(makeInitialProject());
    const initialPresent = state.present;

    // Apply 101 distinct actions
    for (let i = 1; i <= 101; i++) {
      const res = apply(state, { type: "renameProject", name: `Project Version ${i}` });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      state = res.state;
    }

    expect(state.past.length).toBe(100);
    // The initial project (action 0) must be dropped
    expect(state.past.includes(initialPresent)).toBe(false);
    // The oldest remaining state in past is action 1 ("Project Version 1")
    expect(state.past[0]?.name).toBe("Project Version 1");

    // Undoing 100 times lands on action 1
    for (let i = 0; i < 100; i++) {
      expect(canUndo(state)).toBe(true);
      state = undo(state);
    }
    expect(canUndo(state)).toBe(false);
    expect(state.present.name).toBe("Project Version 1");
    expect(state.present).not.toBe(initialPresent);
  });

  it("clears future when a new action is applied", () => {
    const s0 = createEditor(makeInitialProject());
    const res1 = apply(s0, { type: "renameProject", name: "v1" });
    expect(res1.ok).toBe(true);
    if (!res1.ok) return;

    const s1 = res1.state;
    const sUndone = undo(s1);
    expect(sUndone.future.length).toBe(1);
    expect(canRedo(sUndone)).toBe(true);

    const res2 = apply(sUndone, { type: "renameProject", name: "v2" });
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;

    expect(res2.state.future).toEqual([]);
    expect(canRedo(res2.state)).toBe(false);
  });

  it("undo and redo step backward and forward through states", () => {
    const s0 = createEditor(makeInitialProject());
    const r1 = apply(s0, { type: "renameProject", name: "A" });
    if (!r1.ok) throw new Error();
    const r2 = apply(r1.state, { type: "renameProject", name: "B" });
    if (!r2.ok) throw new Error();

    const sB = r2.state;
    const sA = undo(sB);
    expect(sA.present.name).toBe("A");

    const sInit = undo(sA);
    expect(sInit.present.name).toBe("Initial Project");

    const redoneA = redo(sInit);
    expect(redoneA.present.name).toBe("A");

    const redoneB = redo(redoneA);
    expect(redoneB.present.name).toBe("B");
  });

  describe("Content Model v2: node body, speakerId, and entity actions", () => {
    it("updateNode: updates body and speakerId on start, scene, and end nodes", () => {
      const proj: Project = {
        ...makeInitialProject(),
        entities: [
          { id: "char_hero", kind: "character", name: "Hero" },
        ],
      };
      const s0 = createEditor(proj);

      // Start node
      const rStart = apply(s0, {
        type: "updateNode",
        id: "node_start",
        patch: { body: "Once upon a time", speakerId: "char_hero" },
      });
      expect(rStart.ok).toBe(true);
      if (!rStart.ok) return;
      const startNode = rStart.state.present.nodes.find((n) => n.id === "node_start");
      expect(startNode?.body).toBe("Once upon a time");
      expect(startNode?.speakerId).toBe("char_hero");

      // Scene node
      const rScene = apply(rStart.state, {
        type: "updateNode",
        id: "node_scene_1",
        patch: { body: "In the dungeon", speakerId: "char_hero" },
      });
      expect(rScene.ok).toBe(true);
      if (!rScene.ok) return;
      const sceneNode = rScene.state.present.nodes.find((n) => n.id === "node_scene_1");
      expect(sceneNode?.body).toBe("In the dungeon");
      expect(sceneNode?.speakerId).toBe("char_hero");

      // End node
      const rEnd = apply(rScene.state, {
        type: "updateNode",
        id: "node_end",
        patch: { body: "The end", speakerId: "char_hero" },
      });
      expect(rEnd.ok).toBe(true);
      if (!rEnd.ok) return;
      const endNode = rEnd.state.present.nodes.find((n) => n.id === "node_end");
      expect(endNode?.body).toBe("The end");
      expect(endNode?.speakerId).toBe("char_hero");

      // Clearing body and speakerId with null deletes keys completely
      const rClear = apply(rEnd.state, {
        type: "updateNode",
        id: "node_start",
        patch: { body: null, speakerId: null },
      });
      expect(rClear.ok).toBe(true);
      if (!rClear.ok) return;
      const clearedNode = rClear.state.present.nodes.find((n) => n.id === "node_start");
      expect("body" in (clearedNode ?? {})).toBe(false);
      expect("speakerId" in (clearedNode ?? {})).toBe(false);
      expect(JSON.stringify(rClear.state.present)).not.toContain('"speakerId":null');
      expect(JSON.stringify(rClear.state.present)).not.toContain('"speakerId": null');
    });

    it("updateNode: rejects speakerId pointing to missing entity with dangling-reference", () => {
      const s0 = createEditor(makeInitialProject());
      const res = apply(s0, {
        type: "updateNode",
        id: "node_start",
        patch: { speakerId: "missing_entity" },
      });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe("dangling-reference");
      expect(res.error.message).toContain("missing");
      expect(s0.present).toBe(s0.present);
    });

    it("updateNode: rejects speakerId pointing to non-character entity with dangling-reference", () => {
      const proj: Project = {
        ...makeInitialProject(),
        entities: [
          { id: "loc_castle", kind: "location", name: "Castle" },
        ],
      };
      const s0 = createEditor(proj);
      const res = apply(s0, {
        type: "updateNode",
        id: "node_start",
        patch: { speakerId: "loc_castle" },
      });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe("dangling-reference");
      expect(res.error.message).toContain("location");
    });

    it("updateNode: enforces body cap (20,000 accepted vs 20,001 invalid, counts code points)", () => {
      const s0 = createEditor(makeInitialProject());
      const body20000 = "a".repeat(20000);
      const rOk = apply(s0, {
        type: "updateNode",
        id: "node_start",
        patch: { body: body20000 },
      });
      expect(rOk.ok).toBe(true);

      const body20001 = "a".repeat(20001);
      const rOver = apply(s0, {
        type: "updateNode",
        id: "node_start",
        patch: { body: body20001 },
      });
      expect(rOver.ok).toBe(false);
      if (rOver.ok) return;
      expect(rOver.error.code).toBe("invalid");

      // Surrogate pairs count code points, not UTF-16 units
      // "😀" is 1 code point, 2 UTF-16 code units. 20,000 emojis = 20,000 code points, 40,000 code units
      const emojiBody20000 = "😀".repeat(20000);
      expect(emojiBody20000.length).toBe(40000);
      const rEmoji = apply(s0, {
        type: "updateNode",
        id: "node_start",
        patch: { body: emojiBody20000 },
      });
      expect(rEmoji.ok).toBe(true);
    });

    it("addEntity: creates entities key if absent on project", () => {
      const proj = makeInitialProject();
      delete (proj as { entities?: unknown }).entities;
      expect(proj.entities).toBeUndefined();

      const s0 = createEditor(proj);
      const res = apply(s0, {
        type: "addEntity",
        entity: { id: "ent_1", kind: "character", name: "Alice" },
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(Array.isArray(res.state.present.entities)).toBe(true);
      expect(res.state.present.entities).toHaveLength(1);
      expect(res.state.present.entities?.[0]?.name).toBe("Alice");
    });

    it("addEntity: rejects duplicate id, empty/whitespace name, and caps", () => {
      const s0 = createEditor(makeInitialProject());
      const r1 = apply(s0, {
        type: "addEntity",
        entity: { id: "ent_1", kind: "character", name: "Alice" },
      });
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;

      // Duplicate id
      const rDup = apply(r1.state, {
        type: "addEntity",
        entity: { id: "ent_1", kind: "location", name: "Town" },
      });
      expect(rDup.ok).toBe(false);
      if (rDup.ok) return;
      expect(rDup.error.code).toBe("duplicate-id");

      // Whitespace-only name rejected as invalid
      const rWs = apply(r1.state, {
        type: "addEntity",
        entity: { id: "ent_2", kind: "character", name: "   " },
      });
      expect(rWs.ok).toBe(false);
      if (rWs.ok) return;
      expect(rWs.error.code).toBe("invalid");

      // Name cap (120 code points accepted, 121 invalid)
      const rName120 = apply(r1.state, {
        type: "addEntity",
        entity: { id: "ent_name120", kind: "character", name: "a".repeat(120) },
      });
      expect(rName120.ok).toBe(true);
      const rName121 = apply(r1.state, {
        type: "addEntity",
        entity: { id: "ent_name121", kind: "character", name: "a".repeat(121) },
      });
      expect(rName121.ok).toBe(false);
      if (rName121.ok) return;
      expect(rName121.error.code).toBe("invalid");

      // Description cap (5000 code points accepted, 5001 invalid)
      const rDesc5000 = apply(r1.state, {
        type: "addEntity",
        entity: { id: "ent_desc5000", kind: "character", name: "Hero", description: "d".repeat(5000) },
      });
      expect(rDesc5000.ok).toBe(true);
      const rDesc5001 = apply(r1.state, {
        type: "addEntity",
        entity: { id: "ent_desc5001", kind: "character", name: "Hero", description: "d".repeat(5001) },
      });
      expect(rDesc5001.ok).toBe(false);
      if (rDesc5001.ok) return;
      expect(rDesc5001.error.code).toBe("invalid");
    });

    it("addEntity: caps project entities at 1,000 (1,000th accepted, 1,001st invalid)", () => {
      const initialEntities = Array.from({ length: 999 }, (_, i) => ({
        id: `ent_${i}`,
        kind: "character" as const,
        name: `Char ${i}`,
      }));
      const proj: Project = { ...makeInitialProject(), entities: initialEntities };
      const s0 = createEditor(proj);

      // 1,000th entity
      const r1000 = apply(s0, {
        type: "addEntity",
        entity: { id: "ent_1000", kind: "character", name: "1000th Char" },
      });
      expect(r1000.ok).toBe(true);
      if (!r1000.ok) return;
      expect(r1000.state.present.entities).toHaveLength(1000);

      // 1,001st entity
      const r1001 = apply(r1000.state, {
        type: "addEntity",
        entity: { id: "ent_1001", kind: "character", name: "1001st Char" },
      });
      expect(r1001.ok).toBe(false);
      if (r1001.ok) return;
      expect(r1001.error.code).toBe("invalid");
      expect(r1001.error.message).toContain("1000");
    });

    it("updateEntity: updates name, kind, description and clearing desc with null", () => {
      const proj: Project = {
        ...makeInitialProject(),
        entities: [
          { id: "ent_1", kind: "character", name: "Alice", description: "Hero of the realm" },
        ],
      };
      const s0 = createEditor(proj);

      const rUp = apply(s0, {
        type: "updateEntity",
        id: "ent_1",
        patch: { name: "Alice the Brave", description: null },
      });
      expect(rUp.ok).toBe(true);
      if (!rUp.ok) return;
      const updated = rUp.state.present.entities?.find((e) => e.id === "ent_1");
      expect(updated?.name).toBe("Alice the Brave");
      expect("description" in (updated ?? {})).toBe(false);

      // Names and descriptions are stored exactly as typed (no silent trim)
      const rUntrimmed = apply(rUp.state, {
        type: "updateEntity",
        id: "ent_1",
        patch: { name: "  Untrimmed Alice  " },
      });
      expect(rUntrimmed.ok).toBe(true);
      if (!rUntrimmed.ok) return;
      expect(rUntrimmed.state.present.entities?.[0]?.name).toBe("  Untrimmed Alice  ");
    });

    it("updateEntity: rejects kind change away from character when used as speaker (names node count)", () => {
      const proj: Project = {
        ...makeInitialProject(),
        nodes: [
          { id: "node_1", type: "start", title: "N1", speakerId: "char_1" },
          { id: "node_2", type: "scene", title: "N2", speakerId: "char_1" },
        ],
        entities: [
          { id: "char_1", kind: "character", name: "Hero" },
        ],
      };
      const s0 = createEditor(proj);

      const rChange = apply(s0, {
        type: "updateEntity",
        id: "char_1",
        patch: { kind: "location" },
      });
      expect(rChange.ok).toBe(false);
      if (rChange.ok) return;
      expect(rChange.error.code).toBe("dangling-reference");
      expect(rChange.error.message).toContain("2 node(s)");
      expect(rChange.error.message).toContain("Hero");
    });

    it("deleteEntity: cascades to clear speakerIds on referencing nodes; leaves entities: [] if last entity; 1 undo restores all", () => {
      const proj: Project = {
        ...makeInitialProject(),
        nodes: [
          { id: "node_start", type: "start", title: "Start", speakerId: "char_hero" },
          { id: "node_scene_1", type: "scene", title: "Scene", speakerId: "char_hero" },
          { id: "node_end", type: "end", title: "End" },
        ],
        entities: [
          { id: "char_hero", kind: "character", name: "Hero" },
        ],
      };
      const s0 = createEditor(proj);

      const rDel = apply(s0, { type: "deleteEntity", id: "char_hero" });
      expect(rDel.ok).toBe(true);
      if (!rDel.ok) return;

      const delPresent = rDel.state.present;
      // Entity removed and entities: [] key preserved
      expect(delPresent.entities).toEqual([]);
      expect(delPresent.entities).toBeDefined();

      // Referencing nodes have speakerId removed
      const nStart = delPresent.nodes.find((n) => n.id === "node_start");
      const nScene = delPresent.nodes.find((n) => n.id === "node_scene_1");
      const nEnd = delPresent.nodes.find((n) => n.id === "node_end");
      expect(nStart?.speakerId).toBeUndefined();
      expect("speakerId" in (nStart ?? {})).toBe(false);
      expect(nScene?.speakerId).toBeUndefined();
      expect("speakerId" in (nScene ?? {})).toBe(false);
      expect(JSON.stringify(delPresent)).not.toContain('"speakerId":null');
      expect(JSON.stringify(delPresent)).not.toContain('"speakerId": null');
      // Untouched node preserves reference
      expect(Object.is(nEnd, proj.nodes[2])).toBe(true);

      // ONE undo restores the entity and all speaker references
      expect(canUndo(rDel.state)).toBe(true);
      const sUndone = undo(rDel.state);
      expect(sUndone.present.entities).toEqual(proj.entities);
      const undoneStart = sUndone.present.nodes.find((n) => n.id === "node_start");
      const undoneScene = sUndone.present.nodes.find((n) => n.id === "node_scene_1");
      expect(undoneStart?.speakerId).toBe("char_hero");
      expect(undoneScene?.speakerId).toBe("char_hero");
    });

    it("structural sharing and no-op detection on new actions", () => {
      const proj: Project = {
        ...makeInitialProject(),
        nodes: [
          { id: "node_1", type: "start", title: "N1", body: "Hello" },
          { id: "node_2", type: "scene", title: "N2" },
        ],
        entities: [
          { id: "ent_1", kind: "character", name: "Alice", description: "Desc" },
          { id: "ent_2", kind: "location", name: "Town" },
        ],
      };
      const s0 = createEditor(proj);

      // Same-value updateNode: returns identical state reference
      const rNoopNode = apply(s0, {
        type: "updateNode",
        id: "node_1",
        patch: { body: "Hello" },
      });
      expect(rNoopNode.ok).toBe(true);
      if (!rNoopNode.ok) return;
      expect(Object.is(rNoopNode.state, s0)).toBe(true);
      expect(rNoopNode.state.past.length).toBe(0);

      // Same-value updateEntity: returns identical state reference
      const rNoopEntity = apply(s0, {
        type: "updateEntity",
        id: "ent_1",
        patch: { name: "Alice", description: "Desc" },
      });
      expect(rNoopEntity.ok).toBe(true);
      if (!rNoopEntity.ok) return;
      expect(Object.is(rNoopEntity.state, s0)).toBe(true);
      expect(rNoopEntity.state.past.length).toBe(0);

      // Untouched entities and nodes maintain Object.is identity on mutation
      const rMut = apply(s0, {
        type: "updateEntity",
        id: "ent_1",
        patch: { name: "Alice 2" },
      });
      expect(rMut.ok).toBe(true);
      if (!rMut.ok) return;
      expect(Object.is(rMut.state.present.entities?.[1], proj.entities?.[1])).toBe(true);
      expect(Object.is(rMut.state.present.nodes[0], proj.nodes[0])).toBe(true);
      expect(Object.is(rMut.state.present.nodes[1], proj.nodes[1])).toBe(true);
    });
  });
});
