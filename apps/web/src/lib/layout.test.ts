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
    expect(layout.get("scene2")).toEqual({ x: 0, y: 140 });
  });

  it("orphan band: unreachable nodes go into maxLayer + 2", () => {
    const project: Project = {
      id: "p5",
      name: "Orphan Band",
      nodes: [
        { id: "start", type: "start", title: "Start" }, // layer 0
        { id: "scene1", type: "scene", title: "Scene 1" }, // layer 1
        { id: "orphan1", type: "scene", title: "Orphan 1" }, // orphan layer 1+2 = 3
        { id: "orphan2", type: "scene", title: "Orphan 2" }, // orphan layer 3
      ],
      edges: [{ id: "e1", from: "start", to: "scene1" }],
      variables: [],
    };

    const layout = computeLayout(project);
    expect(layout.get("start")).toEqual({ x: 0, y: 0 });
    expect(layout.get("scene1")).toEqual({ x: 380, y: 0 });
    expect(layout.get("orphan1")).toEqual({ x: 3 * 380, y: 0 });
    expect(layout.get("orphan2")).toEqual({ x: 3 * 380, y: 140 });
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
