import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { FlowNodeType, Project } from "@repo/schema";
import { computeLayout } from "./layout.js";

describe("computeLayout", () => {
  it("linear graph: layers follow path length from start", () => {
    const project: Project = {
      id: "p1",
      name: "Linear",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "scene1", type: "scene", title: "Scene 1" },
        { id: "end", type: "end", title: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "scene1" },
        { id: "e2", from: "scene1", to: "end" },
      ],
      variables: [],
    };

    const layout = computeLayout(project);
    expect(layout.get("start")).toEqual({ x: 0, y: 0 });
    expect(layout.get("scene1")).toEqual({ x: 380, y: 0 });
    expect(layout.get("end")).toEqual({ x: 760, y: 0 });
  });

  it("branching: multiple branches share layer index order", () => {
    const project: Project = {
      id: "p2",
      name: "Branching",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "choiceA", type: "scene", title: "Choice A" },
        { id: "choiceB", type: "scene", title: "Choice B" },
        { id: "end", type: "end", title: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "choiceA" },
        { id: "e2", from: "start", to: "choiceB" },
        { id: "e3", from: "choiceA", to: "end" },
        { id: "e4", from: "choiceB", to: "end" },
      ],
      variables: [],
    };

    const layout = computeLayout(project);
    expect(layout.get("start")).toEqual({ x: 0, y: 0 });
    expect(layout.get("choiceA")).toEqual({ x: 380, y: 0 });
    expect(layout.get("choiceB")).toEqual({ x: 380, y: 140 });
    expect(layout.get("end")).toEqual({ x: 760, y: 0 });
  });

  it("cycle: handles cycles without infinite loop and uses shortest path", () => {
    const project: Project = {
      id: "p3",
      name: "Cycle",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "loop1", type: "scene", title: "Loop 1" },
        { id: "loop2", type: "scene", title: "Loop 2" },
      ],
      edges: [
        { id: "e1", from: "start", to: "loop1" },
        { id: "e2", from: "loop1", to: "loop2" },
        { id: "e3", from: "loop2", to: "loop1" },
      ],
      variables: [],
    };

    const layout = computeLayout(project);
    expect(layout.get("start")).toEqual({ x: 0, y: 0 });
    expect(layout.get("loop1")).toEqual({ x: 380, y: 0 });
    expect(layout.get("loop2")).toEqual({ x: 760, y: 0 });
  });

  it("no start node: all nodes go into orphan band at layer 0", () => {
    const project: Project = {
      id: "p4",
      name: "No Start",
      nodes: [
        { id: "scene1", type: "scene", title: "Scene 1" },
        { id: "scene2", type: "scene", title: "Scene 2" },
      ],
      edges: [{ id: "e1", from: "scene1", to: "scene2" }],
      variables: [],
    };

    const layout = computeLayout(project);
    expect(layout.get("scene1")).toEqual({ x: 0, y: 0 });
    expect(layout.get("scene2")).toEqual({ x: 380, y: 0 });
  });

  it("orphan band: unreachable nodes go into orphan grid below main flow", () => {
    const project: Project = {
      id: "p5",
      name: "Orphan Band",
      nodes: [
        { id: "start", type: "start", title: "Start" }, // layer 0
        { id: "scene1", type: "scene", title: "Scene 1" }, // layer 1
        { id: "orphan1", type: "scene", title: "Orphan 1" }, // orphan col 0, row 0
        { id: "orphan2", type: "scene", title: "Orphan 2" }, // orphan col 1, row 0
      ],
      edges: [{ id: "e1", from: "start", to: "scene1" }],
      variables: [],
    };

    const layout = computeLayout(project);
    expect(layout.get("start")).toEqual({ x: 0, y: 0 });
    expect(layout.get("scene1")).toEqual({ x: 380, y: 0 });
    expect(layout.get("orphan1")).toEqual({ x: 0, y: 280 });
    expect(layout.get("orphan2")).toEqual({ x: 380, y: 280 });
  });

  it("explicit position kept exactly", () => {
    const project: Project = {
      id: "p6",
      name: "Explicit Position",
      nodes: [
        { id: "start", type: "start", title: "Start", position: { x: 999, y: 888 } },
        { id: "scene1", type: "scene", title: "Scene 1" },
      ],
      edges: [{ id: "e1", from: "start", to: "scene1" }],
      variables: [],
    };

    const layout = computeLayout(project);
    expect(layout.get("start")).toEqual({ x: 999, y: 888 });
    expect(layout.get("scene1")).toEqual({ x: 380, y: 0 });
  });

  it("dangling edge referencing nonexistent nodes is ignored", () => {
    const project: Project = {
      id: "p7",
      name: "Dangling",
      nodes: [{ id: "start", type: "start", title: "Start" }],
      edges: [
        { id: "e1", from: "start", to: "ghost_to" },
        { id: "e2", from: "ghost_from", to: "start" },
      ],
      variables: [],
    };

    const layout = computeLayout(project);
    expect(layout.get("start")).toEqual({ x: 0, y: 0 });
  });

  it("determinism: repeated calls return identical coordinates", () => {
    const project: Project = {
      id: "p8",
      name: "Deterministic",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "b", type: "scene", title: "B" },
        { id: "a", type: "scene", title: "A" },
      ],
      edges: [
        { id: "e1", from: "start", to: "b" },
        { id: "e2", from: "start", to: "a" },
      ],
      variables: [],
    };

    const layout1 = computeLayout(project);
    const layout2 = computeLayout(project);
    expect([...layout1.entries()]).toEqual([...layout2.entries()]);
  });

  it("orphans sit below the main flow: y >= bandTop > every auto-placed main-flow y", () => {
    const project: Project = {
      id: "p_orphan_below",
      name: "Orphans Below",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "scene1", type: "scene", title: "Scene 1" },
        { id: "scene1_branch", type: "scene", title: "Scene 1 Branch" },
        { id: "scene2", type: "scene", title: "Scene 2" },
        { id: "orphan1", type: "scene", title: "Orphan 1" },
        { id: "orphan2", type: "scene", title: "Orphan 2" },
      ],
      edges: [
        { id: "e1", from: "start", to: "scene1" },
        { id: "e2", from: "start", to: "scene1_branch" },
        { id: "e3", from: "scene1", to: "scene2" },
      ],
      variables: [],
    };

    const layout = computeLayout(project);
    // Main flow layers: layer 0 (start), layer 1 (scene1, scene1_branch: max count 2), layer 2 (scene2)
    // bandTop = 2 * 140 + 140 = 420
    const bandTop = 420;

    const mainFlowYValues = ["start", "scene1", "scene1_branch", "scene2"].map(
      (id) => layout.get(id)?.y ?? -1,
    );
    for (const y of mainFlowYValues) {
      expect(bandTop).toBeGreaterThan(y);
    }

    const orphan1Pos = layout.get("orphan1");
    const orphan2Pos = layout.get("orphan2");
    expect(orphan1Pos).toBeDefined();
    expect(orphan2Pos).toBeDefined();
    expect(orphan1Pos?.y).toBeGreaterThanOrEqual(bandTop);
    expect(orphan2Pos?.y).toBeGreaterThanOrEqual(bandTop);

    expect(orphan1Pos).toEqual({ x: 0, y: 420 });
    expect(orphan2Pos).toEqual({ x: 380, y: 420 });
  });

  it("grid wrapping: more orphans than columns wraps to subsequent rows", () => {
    const project: Project = {
      id: "p_wrapping",
      name: "Wrapping",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "scene1", type: "scene", title: "Scene 1" },
        { id: "orph0", type: "scene", title: "Orph 0" },
        { id: "orph1", type: "scene", title: "Orph 1" },
        { id: "orph2", type: "scene", title: "Orph 2" },
        { id: "orph3", type: "scene", title: "Orph 3" },
        { id: "orph4", type: "scene", title: "Orph 4" },
      ],
      edges: [{ id: "e1", from: "start", to: "scene1" }],
      variables: [],
    };

    const layout = computeLayout(project);
    // mainLayerCount = 2 -> columns = max(3, 2) = 3
    // maxAuto = 1 -> bandTop = 1 * 140 + 140 = 280
    // row 0: orph0 (0, 280), orph1 (380, 280), orph2 (760, 280)
    // row 1: orph3 (0, 420), orph4 (380, 420)
    expect(layout.get("orph0")).toEqual({ x: 0, y: 280 });
    expect(layout.get("orph1")).toEqual({ x: 380, y: 280 });
    expect(layout.get("orph2")).toEqual({ x: 760, y: 280 });
    expect(layout.get("orph3")).toEqual({ x: 0, y: 420 });
    expect(layout.get("orph4")).toEqual({ x: 380, y: 420 });
  });

  it("columns = 3 when there are fewer than 3 main layers", () => {
    const project: Project = {
      id: "p_columns_3",
      name: "Cols 3",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "orph0", type: "scene", title: "Orph 0" },
        { id: "orph1", type: "scene", title: "Orph 1" },
        { id: "orph2", type: "scene", title: "Orph 2" },
        { id: "orph3", type: "scene", title: "Orph 3" },
      ],
      edges: [],
      variables: [],
    };

    const layout = computeLayout(project);
    // mainLayerCount = 1 -> columns = 3
    // maxAuto = 1 -> bandTop = 280
    expect(layout.get("orph0")).toEqual({ x: 0, y: 280 });
    expect(layout.get("orph1")).toEqual({ x: 380, y: 280 });
    expect(layout.get("orph2")).toEqual({ x: 760, y: 280 });
    expect(layout.get("orph3")).toEqual({ x: 0, y: 420 });
  });

  it("no start node: all nodes are orphans, bandTop = 0, grid starts from origin", () => {
    const project: Project = {
      id: "p_all_orphans",
      name: "All Orphans",
      nodes: [
        { id: "n0", type: "scene", title: "N 0" },
        { id: "n1", type: "scene", title: "N 1" },
        { id: "n2", type: "scene", title: "N 2" },
        { id: "n3", type: "scene", title: "N 3" },
      ],
      edges: [],
      variables: [],
    };

    const layout = computeLayout(project);
    // mainLayerCount = 0 -> columns = 3; bandTop = 0
    expect(layout.get("n0")).toEqual({ x: 0, y: 0 });
    expect(layout.get("n1")).toEqual({ x: 380, y: 0 });
    expect(layout.get("n2")).toEqual({ x: 760, y: 0 });
    expect(layout.get("n3")).toEqual({ x: 0, y: 140 });
  });

  it("explicit position on an orphan is kept and that node does not consume a grid slot", () => {
    const project: Project = {
      id: "p_orphan_explicit",
      name: "Orphan Explicit",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "orphan_fixed", type: "scene", title: "Fixed", position: { x: 50, y: 50 } },
        { id: "orphan_auto_0", type: "scene", title: "Auto 0" },
        { id: "orphan_auto_1", type: "scene", title: "Auto 1" },
      ],
      edges: [],
      variables: [],
    };

    const layout = computeLayout(project);
    // orphan_fixed retains its position exactly
    expect(layout.get("orphan_fixed")).toEqual({ x: 50, y: 50 });
    // orphan_auto_0 is slot 0: (0, 280)
    expect(layout.get("orphan_auto_0")).toEqual({ x: 0, y: 280 });
    // orphan_auto_1 is slot 1: (380, 280)
    expect(layout.get("orphan_auto_1")).toEqual({ x: 380, y: 280 });
  });

  it("main flow where every node has an explicit position gives bandTop = 0", () => {
    const project: Project = {
      id: "p_all_explicit_main",
      name: "Explicit Main",
      nodes: [
        { id: "start", type: "start", title: "Start", position: { x: 100, y: 100 } },
        { id: "scene1", type: "scene", title: "Scene 1", position: { x: 200, y: 200 } },
        { id: "orphan_auto", type: "scene", title: "Orphan Auto" },
      ],
      edges: [{ id: "e1", from: "start", to: "scene1" }],
      variables: [],
    };

    const layout = computeLayout(project);
    // main flow has nodes, but 0 auto-placed nodes -> maxAuto = 0 -> bandTop = 0
    // columns = max(3, 2) = 3
    // orphan_auto is at col 0, row 0 -> (0, 0)
    expect(layout.get("orphan_auto")).toEqual({ x: 0, y: 0 });
    expect(layout.get("start")).toEqual({ x: 100, y: 100 });
    expect(layout.get("scene1")).toEqual({ x: 200, y: 200 });
  });

  it("determinism: layout with orphans returns identical coordinates across runs", () => {
    const project: Project = {
      id: "p_det_orphans",
      name: "Deterministic Orphans",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "orphan_b", type: "scene", title: "Orphan B" },
        { id: "orphan_a", type: "scene", title: "Orphan A" },
      ],
      edges: [],
      variables: [],
    };

    const l1 = computeLayout(project);
    const l2 = computeLayout(project);
    expect([...l1.entries()]).toEqual([...l2.entries()]);
  });

  it("Property: every node gets finite coordinates, explicit positions are unchanged, and generated positions never share coordinates", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: 10 })
          .chain((nodeCount) => {
            const ids = Array.from({ length: nodeCount }, (_, i) => `node_${i}`);
            return fc.record({
              nodeTypes: fc.array(
                fc.constantFrom<FlowNodeType>("start", "scene", "end"),
                { minLength: nodeCount, maxLength: nodeCount },
              ),
              positions: fc.array(
                fc.option(
                  fc.record({
                    x: fc.integer({ min: -1000, max: 1000 }),
                    y: fc.integer({ min: -1000, max: 1000 }),
                  }),
                  { nil: undefined },
                ),
                { minLength: nodeCount, maxLength: nodeCount },
              ),
              edges: fc.array(
                fc.record({
                  id: fc.uuid(),
                  from: fc.constantFrom(...ids, "dangling_from"),
                  to: fc.constantFrom(...ids, "dangling_to"),
                }),
                { maxLength: 15 },
              ),
            }).map(({ nodeTypes, positions, edges }) => {
              const nodes = ids.map((id, idx) => ({
                id,
                type: nodeTypes[idx] ?? "scene",
                title: `Node ${id}`,
                position: positions[idx],
              }));
              return {
                id: "rand_proj",
                name: "Random Layout Project",
                nodes,
                edges,
                variables: [],
              } satisfies Project;
            });
          }),
        (project) => {
          const layout = computeLayout(project);
          expect(layout.size).toBe(project.nodes.length);

          const generatedCoordinates = new Set<string>();

          for (const node of project.nodes) {
            const pos = layout.get(node.id);
            expect(pos).toBeDefined();
            if (!pos) continue;

            expect(Number.isFinite(pos.x)).toBe(true);
            expect(Number.isFinite(pos.y)).toBe(true);

            if (node.position) {
              expect(pos.x).toBe(node.position.x);
              expect(pos.y).toBe(node.position.y);
            } else {
              const key = `${pos.x},${pos.y}`;
              expect(generatedCoordinates.has(key)).toBe(false);
              generatedCoordinates.add(key);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
