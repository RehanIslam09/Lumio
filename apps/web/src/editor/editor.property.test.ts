import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { ProjectSchema, type Project, type FlowNode, type FlowEdge, type Variable } from "@repo/schema";
import { sampleProject } from "../demo/sampleProject";
import {
  createEditor,
  apply,
  undo,
  redo,
  canUndo,
  canRedo,
  nextId,
  type EditorAction,
} from "./index";
import { structurallyEqual } from "./equal";

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

function pickAt<T>(array: readonly T[], index: number): T | undefined {
  if (array.length === 0) return undefined;
  return array[index % array.length];
}

type ActionIntent =
  | { kind: "renameProject"; pickCurrent: boolean; name: string }
  | {
      kind: "addNode";
      pickDuplicate: boolean;
      index: number;
      title: string;
      nodeType: FlowNode["type"];
      withPosition: boolean;
      x: number;
      y: number;
    }
  | {
      kind: "updateNode";
      mode: "modify" | "noop" | "missing";
      index: number;
      title?: string;
      nodeType?: FlowNode["type"];
      positionMode: "keep" | "null" | "new";
      x: number;
      y: number;
    }
  | {
      kind: "moveNode";
      mode: "modify" | "noop" | "missing";
      index: number;
      x: number;
      y: number;
    }
  | {
      kind: "deleteNode";
      pickMissing: boolean;
      index: number;
    }
  | {
      kind: "addEdge";
      pickDuplicate: boolean;
      pickDangling: boolean;
      index: number;
      conditionMode: "none" | "null" | "text";
      effectsMode: "none" | "null" | "array";
    }
  | {
      kind: "updateEdge";
      mode: "modify" | "noop" | "missing" | "dangling";
      index: number;
      conditionMode: "keep" | "null" | "text";
      effectsMode: "keep" | "null" | "array";
    }
  | {
      kind: "deleteEdge";
      pickMissing: boolean;
      index: number;
    }
  | {
      kind: "addVariable";
      pickDuplicate: boolean;
      pickInvalidName: boolean;
      index: number;
      varType: Variable["type"];
      withInitial: boolean;
    }
  | {
      kind: "updateVariable";
      mode: "modify" | "noop" | "missing";
      index: number;
      changeType: boolean;
      varType: Variable["type"];
      initialMode: "keep" | "null" | "valid" | "invalid";
    }
  | {
      kind: "deleteVariable";
      pickMissing: boolean;
      index: number;
    };

function resolveIntent(intent: ActionIntent, current: Project): EditorAction {
  switch (intent.kind) {
    case "renameProject": {
      if (intent.pickCurrent) {
        return { type: "renameProject", name: current.name };
      }
      return { type: "renameProject", name: intent.name };
    }

    case "addNode": {
      let id: string;
      const duplicateNode = pickAt(current.nodes, intent.index);
      if (intent.pickDuplicate && duplicateNode) {
        id = duplicateNode.id;
      } else {
        id = nextId(current.nodes.map((n) => n.id), "node");
      }
      const node: FlowNode = {
        id,
        type: intent.nodeType,
        title: intent.title,
        ...(intent.withPosition ? { position: { x: intent.x, y: intent.y } } : {}),
      };
      return { type: "addNode", node };
    }

    case "updateNode": {
      const target = pickAt(current.nodes, intent.index);
      if (intent.mode === "missing" || !target) {
        return {
          type: "updateNode",
          id: `missing_node_${intent.index}`,
          patch: { title: intent.title },
        };
      }
      if (intent.mode === "noop") {
        return {
          type: "updateNode",
          id: target.id,
          patch: { title: target.title },
        };
      }
      const patch: {
        title?: string;
        type?: FlowNode["type"];
        position?: { x: number; y: number } | null;
      } = {};
      if (intent.title !== undefined) patch.title = intent.title;
      if (intent.nodeType !== undefined) patch.type = intent.nodeType;
      if (intent.positionMode === "null") patch.position = null;
      else if (intent.positionMode === "new") patch.position = { x: intent.x, y: intent.y };

      return { type: "updateNode", id: target.id, patch };
    }

    case "moveNode": {
      const target = pickAt(current.nodes, intent.index);
      if (intent.mode === "missing" || !target) {
        return {
          type: "moveNode",
          id: `missing_node_${intent.index}`,
          position: { x: intent.x, y: intent.y },
        };
      }
      if (intent.mode === "noop" && target.position) {
        return {
          type: "moveNode",
          id: target.id,
          position: { x: target.position.x, y: target.position.y },
        };
      }
      return {
        type: "moveNode",
        id: target.id,
        position: { x: intent.x, y: intent.y },
      };
    }

    case "deleteNode": {
      const target = pickAt(current.nodes, intent.index);
      if (intent.pickMissing || !target) {
        return { type: "deleteNode", id: `missing_node_${intent.index}` };
      }
      return { type: "deleteNode", id: target.id };
    }

    case "addEdge": {
      let id: string;
      const duplicateEdge = pickAt(current.edges, intent.index);
      if (intent.pickDuplicate && duplicateEdge) {
        id = duplicateEdge.id;
      } else {
        id = nextId(current.edges.map((e) => e.id), "edge");
      }

      let from: string;
      let to: string;
      const fromNode = pickAt(current.nodes, intent.index);
      const toNode = pickAt(current.nodes, intent.index + 1);
      if (intent.pickDangling || !fromNode || !toNode) {
        from = `dangling_node_from_${intent.index}`;
        to = current.nodes[0]?.id ?? "dangling_node_to";
      } else {
        from = fromNode.id;
        to = toNode.id;
      }

      const edge: FlowEdge = {
        id,
        from,
        to,
        ...(intent.conditionMode === "text" ? { condition: "true" } : {}),
        ...(intent.effectsMode === "array" ? { effects: ["var_a = 1"] } : {}),
      };
      return { type: "addEdge", edge };
    }

    case "updateEdge": {
      const target = pickAt(current.edges, intent.index);
      if (intent.mode === "missing" || !target) {
        return {
          type: "updateEdge",
          id: `missing_edge_${intent.index}`,
          patch: { condition: "true" },
        };
      }
      if (intent.mode === "noop") {
        return {
          type: "updateEdge",
          id: target.id,
          patch: { from: target.from, to: target.to },
        };
      }
      const patch: {
        from?: string;
        to?: string;
        condition?: string | null;
        effects?: string[] | null;
      } = {};

      if (intent.mode === "dangling") {
        patch.to = `dangling_target_${intent.index}`;
      }
      if (intent.conditionMode === "null") patch.condition = null;
      else if (intent.conditionMode === "text") patch.condition = "true";

      if (intent.effectsMode === "null") patch.effects = null;
      else if (intent.effectsMode === "array") patch.effects = ["var_a = 1"];

      return { type: "updateEdge", id: target.id, patch };
    }

    case "deleteEdge": {
      const target = pickAt(current.edges, intent.index);
      if (intent.pickMissing || !target) {
        return { type: "deleteEdge", id: `missing_edge_${intent.index}` };
      }
      return { type: "deleteEdge", id: target.id };
    }

    case "addVariable": {
      let id: string;
      const duplicateVar = pickAt(current.variables, intent.index);
      if (intent.pickDuplicate && duplicateVar) {
        id = duplicateVar.id;
      } else {
        id = nextId(current.variables.map((v) => v.id), "var");
      }

      const name = intent.pickInvalidName ? "true" : `var_intent_${intent.index}`;
      let initial: number | string | boolean | undefined;
      if (intent.withInitial) {
        if (intent.varType === "number") initial = 42;
        else if (intent.varType === "string") initial = "init";
        else initial = true;
      }
      const variable: Variable = {
        id,
        name,
        type: intent.varType,
        ...(initial !== undefined ? { initial } : {}),
      };
      return { type: "addVariable", variable };
    }

    case "updateVariable": {
      const target = pickAt(current.variables, intent.index);
      if (intent.mode === "missing" || !target) {
        return {
          type: "updateVariable",
          id: `missing_var_${intent.index}`,
          patch: { name: "v_missing" },
        };
      }
      if (intent.mode === "noop") {
        return {
          type: "updateVariable",
          id: target.id,
          patch: { name: target.name },
        };
      }
      const patch: {
        name?: string;
        type?: Variable["type"];
        initial?: Variable["initial"] | null;
      } = {};

      if (intent.changeType) {
        patch.type = intent.varType;
      }
      if (intent.initialMode === "null") {
        patch.initial = null;
      } else if (intent.initialMode === "valid") {
        const t = patch.type ?? target.type;
        patch.initial = t === "number" ? 99 : t === "string" ? "ok" : false;
      } else if (intent.initialMode === "invalid") {
        const t = patch.type ?? target.type;
        patch.initial = t === "number" ? "not_a_num" : 123;
      }

      return { type: "updateVariable", id: target.id, patch };
    }

    case "deleteVariable": {
      const target = pickAt(current.variables, intent.index);
      if (intent.pickMissing || !target) {
        return { type: "deleteVariable", id: `missing_var_${intent.index}` };
      }
      return { type: "deleteVariable", id: target.id };
    }
  }
}

const actionIntentArbitrary: fc.Arbitrary<ActionIntent> = fc.oneof(
  fc.record({
    kind: fc.constant("renameProject" as const),
    pickCurrent: fc.boolean(),
    name: fc.string({ maxLength: 30 }),
  }),
  fc.record({
    kind: fc.constant("addNode" as const),
    pickDuplicate: fc.boolean(),
    index: fc.nat(),
    title: fc.string({ maxLength: 30 }),
    nodeType: fc.constantFrom("start" as const, "scene" as const, "end" as const),
    withPosition: fc.boolean(),
    x: fc.integer({ min: -2000, max: 2000 }),
    y: fc.integer({ min: -2000, max: 2000 }),
  }),
  fc.record({
    kind: fc.constant("updateNode" as const),
    mode: fc.constantFrom("modify" as const, "noop" as const, "missing" as const),
    index: fc.nat(),
    title: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
    nodeType: fc.option(
      fc.constantFrom("start" as const, "scene" as const, "end" as const),
      { nil: undefined }
    ),
    positionMode: fc.constantFrom("keep" as const, "null" as const, "new" as const),
    x: fc.integer({ min: -2000, max: 2000 }),
    y: fc.integer({ min: -2000, max: 2000 }),
  }),
  fc.record({
    kind: fc.constant("moveNode" as const),
    mode: fc.constantFrom("modify" as const, "noop" as const, "missing" as const),
    index: fc.nat(),
    x: fc.integer({ min: -2000, max: 2000 }),
    y: fc.integer({ min: -2000, max: 2000 }),
  }),
  fc.record({
    kind: fc.constant("deleteNode" as const),
    pickMissing: fc.boolean(),
    index: fc.nat(),
  }),
  fc.record({
    kind: fc.constant("addEdge" as const),
    pickDuplicate: fc.boolean(),
    pickDangling: fc.boolean(),
    index: fc.nat(),
    conditionMode: fc.constantFrom("none" as const, "null" as const, "text" as const),
    effectsMode: fc.constantFrom("none" as const, "null" as const, "array" as const),
  }),
  fc.record({
    kind: fc.constant("updateEdge" as const),
    mode: fc.constantFrom(
      "modify" as const,
      "noop" as const,
      "missing" as const,
      "dangling" as const
    ),
    index: fc.nat(),
    conditionMode: fc.constantFrom("keep" as const, "null" as const, "text" as const),
    effectsMode: fc.constantFrom("keep" as const, "null" as const, "array" as const),
  }),
  fc.record({
    kind: fc.constant("deleteEdge" as const),
    pickMissing: fc.boolean(),
    index: fc.nat(),
  }),
  fc.record({
    kind: fc.constant("addVariable" as const),
    pickDuplicate: fc.boolean(),
    pickInvalidName: fc.boolean(),
    index: fc.nat(),
    varType: fc.constantFrom("number" as const, "string" as const, "boolean" as const),
    withInitial: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant("updateVariable" as const),
    mode: fc.constantFrom("modify" as const, "noop" as const, "missing" as const),
    index: fc.nat(),
    changeType: fc.boolean(),
    varType: fc.constantFrom("number" as const, "string" as const, "boolean" as const),
    initialMode: fc.constantFrom(
      "keep" as const,
      "null" as const,
      "valid" as const,
      "invalid" as const
    ),
  }),
  fc.record({
    kind: fc.constant("deleteVariable" as const),
    pickMissing: fc.boolean(),
    index: fc.nat(),
  })
);

describe("Editor Property Tests", () => {
  it("E1 (integrity): preserves graph and project invariants after every action", () => {
    // Assert sampleProject itself satisfies integrity invariants
    const sampleNodeIds = new Set(sampleProject.nodes.map((n) => n.id));
    expect(sampleNodeIds.size).toBe(sampleProject.nodes.length);
    for (const edge of sampleProject.edges) {
      expect(sampleNodeIds.has(edge.from)).toBe(true);
      expect(sampleNodeIds.has(edge.to)).toBe(true);
    }
    expect(ProjectSchema.safeParse(sampleProject).success).toBe(true);

    let acceptedCount = 0;
    let rejectedCount = 0;
    let noopCount = 0;

    fc.assert(
      fc.property(fc.array(actionIntentArbitrary, { minLength: 1, maxLength: 50 }), (intents) => {
        let state = createEditor(sampleProject);

        for (const intent of intents) {
          const prevState = state;
          const action = resolveIntent(intent, state.present);
          const result = apply(state, action);

          if (!result.ok) {
            rejectedCount++;
            // Rejection leaves state alone
            expect(result.ok).toBe(false);
            expect(state).toBe(prevState);
            continue;
          }

          if (Object.is(result.state, state)) {
            noopCount++;
          } else {
            acceptedCount++;
          }

          state = result.state;
          const currentNodes = state.present.nodes;
          const nodeIds = new Set(currentNodes.map((n) => n.id));

          // 1. Node IDs are unique
          expect(nodeIds.size).toBe(currentNodes.length);

          // 2. Every edge's from/to exists in present.nodes
          for (const edge of state.present.edges) {
            expect(nodeIds.has(edge.from)).toBe(true);
            expect(nodeIds.has(edge.to)).toBe(true);
          }

          // 3. Project schema validation of present passes
          const parseResult = ProjectSchema.safeParse(state.present);
          expect(parseResult.success).toBe(true);
        }
      }),
      { numRuns: 50 }
    );

    const totalActions = acceptedCount + rejectedCount + noopCount;
    expect(totalActions).toBeGreaterThan(0);

    const acceptedPct = (acceptedCount / totalActions) * 100;
    const rejectedPct = (rejectedCount / totalActions) * 100;
    const noopPct = (noopCount / totalActions) * 100;

    // Sanity check: each outcome occurs at least 10% of the time
    console.info(
      `E1 distribution: accepted=${acceptedPct.toFixed(1)}% (${acceptedCount}), rejected=${rejectedPct.toFixed(1)}% (${rejectedCount}), noop=${noopPct.toFixed(1)}% (${noopCount}), total=${totalActions}`
    );
    expect(acceptedPct).toBeGreaterThanOrEqual(10);
    expect(rejectedPct).toBeGreaterThanOrEqual(10);
    expect(noopPct).toBeGreaterThanOrEqual(10);
  });

  it("E2 (undo identity): undoing N successful actions restores initial; redoing restores final", () => {
    fc.assert(
      fc.property(
        fc.array(actionIntentArbitrary, { minLength: 1, maxLength: 100 }),
        (intents) => {
          let state = createEditor(sampleProject);
          const initialProject = state.present;
          let successfulCount = 0;

          for (const intent of intents) {
            if (successfulCount >= 100) break;
            const action = resolveIntent(intent, state.present);
            const res = apply(state, action);
            if (res.ok && !Object.is(res.state, state)) {
              state = res.state;
              successfulCount++;
            }
          }

          const finalProject = state.present;

          // Undo N times
          let undoState = state;
          for (let i = 0; i < successfulCount; i++) {
            expect(canUndo(undoState)).toBe(true);
            undoState = undo(undoState);
          }
          expect(canUndo(undoState)).toBe(false);
          expect(structurallyEqual(undoState.present, initialProject)).toBe(true);

          // Redo N times
          let redoState = undoState;
          for (let i = 0; i < successfulCount; i++) {
            expect(canRedo(redoState)).toBe(true);
            redoState = redo(redoState);
          }
          expect(canRedo(redoState)).toBe(false);
          expect(structurallyEqual(redoState.present, finalProject)).toBe(true);
        }
      ),
      { numRuns: 25 }
    );
  });

  it("E3 (purity): frozen state and action do not throw or mutate on apply, undo, redo", () => {
    fc.assert(
      fc.property(actionIntentArbitrary, (intent) => {
        const state = createEditor(sampleProject);
        const action = resolveIntent(intent, state.present);

        // Deep freeze input state and action
        deepFreeze(state);
        deepFreeze(action);

        expect(() => {
          const res = apply(state, action);
          if (res.ok) {
            deepFreeze(res.state);
            const u = undo(res.state);
            deepFreeze(u);
            redo(u);
          }
        }).not.toThrow();
      }),
      { numRuns: 50 }
    );
  });

  it("E4 (rejection leaves state alone): apply returning ok:false leaves state unchanged", () => {
    fc.assert(
      fc.property(actionIntentArbitrary, (intent) => {
        const state = createEditor(sampleProject);
        const action = resolveIntent(intent, state.present);

        const beforePresent = state.present;
        const beforePastLength = state.past.length;
        const beforeFutureLength = state.future.length;

        const res = apply(state, action);
        if (!res.ok) {
          expect(state.present).toBe(beforePresent);
          expect(state.past.length).toBe(beforePastLength);
          expect(state.future.length).toBe(beforeFutureLength);
          expect(structurallyEqual(state.present, beforePresent)).toBe(true);
        }
      }),
      { numRuns: 50 }
    );
  });
});
