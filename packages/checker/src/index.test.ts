import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { FlowEdge, FlowNode, Project } from "@repo/schema";
import { findUnreachableNodes } from "./index.js";

describe("findUnreachableNodes", () => {
  it("linear graph: all reachable nodes return empty array", () => {
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
    };

    expect(findUnreachableNodes(project)).toEqual([]);
  });

  it("branching: multiple branches from start are all reachable", () => {
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
    };

    expect(findUnreachableNodes(project)).toEqual([]);
  });

  it("disconnected node: reports disconnected node id", () => {
    const project: Project = {
      id: "p3",
      name: "Disconnected",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "scene1", type: "scene", title: "Scene 1" },
        { id: "island", type: "scene", title: "Island" },
      ],
      edges: [{ id: "e1", from: "start", to: "scene1" }],
    };

    expect(findUnreachableNodes(project)).toEqual(["island"]);
  });

  it("no start node: returns all node ids in project.nodes order", () => {
    const project: Project = {
      id: "p4",
      name: "No Start",
      nodes: [
        { id: "scene1", type: "scene", title: "Scene 1" },
        { id: "scene2", type: "scene", title: "Scene 2" },
        { id: "end", type: "end", title: "End" },
      ],
      edges: [
        { id: "e1", from: "scene1", to: "scene2" },
        { id: "e2", from: "scene2", to: "end" },
      ],
    };

    expect(findUnreachableNodes(project)).toEqual(["scene1", "scene2", "end"]);
  });

  it("cycle: handles cycles without infinite loop and reports reachable", () => {
    const project: Project = {
      id: "p5",
      name: "Cycle",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "loopA", type: "scene", title: "Loop A" },
        { id: "loopB", type: "scene", title: "Loop B" },
        { id: "orphan", type: "scene", title: "Orphan" },
      ],
      edges: [
        { id: "e1", from: "start", to: "loopA" },
        { id: "e2", from: "loopA", to: "loopB" },
        { id: "e3", from: "loopB", to: "loopA" },
      ],
    };

    expect(findUnreachableNodes(project)).toEqual(["orphan"]);
  });

  it("multiple start nodes: nodes reachable from ANY start node are reachable", () => {
    const project: Project = {
      id: "p6",
      name: "Multiple Starts",
      nodes: [
        { id: "start1", type: "start", title: "Start 1" },
        { id: "start2", type: "start", title: "Start 2" },
        { id: "scene1", type: "scene", title: "Scene 1" },
        { id: "scene2", type: "scene", title: "Scene 2" },
        { id: "orphan", type: "scene", title: "Orphan" },
      ],
      edges: [
        { id: "e1", from: "start1", to: "scene1" },
        { id: "e2", from: "start2", to: "scene2" },
      ],
    };

    expect(findUnreachableNodes(project)).toEqual(["orphan"]);
  });

  it("edges referencing nonexistent nodes are ignored", () => {
    const project: Project = {
      id: "p7",
      name: "Ghost Edges",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "scene1", type: "scene", title: "Scene 1" },
      ],
      edges: [
        { id: "e1", from: "start", to: "ghostNode" },
        { id: "e2", from: "ghostNode", to: "scene1" },
      ],
    };

    expect(findUnreachableNodes(project)).toEqual(["scene1"]);
  });

  it("result order: unreachable nodes are returned in the exact same order as project.nodes", () => {
    const project: Project = {
      id: "p8",
      name: "Order Preservation",
      nodes: [
        { id: "orphanZ", type: "scene", title: "Z" },
        { id: "start", type: "start", title: "Start" },
        { id: "orphanA", type: "scene", title: "A" },
        { id: "orphanM", type: "scene", title: "M" },
      ],
      edges: [],
    };

    expect(findUnreachableNodes(project)).toEqual(["orphanZ", "orphanA", "orphanM"]);
  });

  it("no duplicates: unreachable node ids have no duplicates", () => {
    const project: Project = {
      id: "p9",
      name: "No Duplicates",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "unreached1", type: "scene", title: "Unreached 1" },
        { id: "unreached2", type: "scene", title: "Unreached 2" },
      ],
      edges: [
        { id: "e1", from: "unreached1", to: "unreached2" },
        { id: "e2", from: "unreached1", to: "unreached2" },
      ],
    };

    const unreachable = findUnreachableNodes(project);
    expect(unreachable).toEqual(["unreached1", "unreached2"]);
    expect(new Set(unreachable).size).toBe(unreachable.length);
  });

  it("start nodes are never reported even if disconnected from other nodes", () => {
    const project: Project = {
      id: "p10",
      name: "Isolated Starts",
      nodes: [
        { id: "start1", type: "start", title: "Start 1" },
        { id: "start2", type: "start", title: "Start 2" },
        { id: "orphan", type: "scene", title: "Orphan" },
      ],
      edges: [],
    };

    expect(findUnreachableNodes(project)).toEqual(["orphan"]);
  });

  it("property test: every node reachable by construction is never reported", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }).chain((reachableCount) =>
          fc.record({
            reachableIds: fc.constant(
              Array.from({ length: reachableCount }, (_, i) => `reachable_${i}`),
            ),
            unreachableCount: fc.integer({ min: 0, max: 10 }),
          }),
        ),
        ({ reachableIds, unreachableCount }) => {
          const firstReachableId = reachableIds[0];
          if (!firstReachableId) {
            return;
          }
          const nodes: FlowNode[] = [
            { id: firstReachableId, type: "start", title: "Start" },
          ];

          const edges: FlowEdge[] = [];
          for (let i = 1; i < reachableIds.length; i++) {
            const currentId = reachableIds[i];
            const parentIndex = Math.floor(Math.random() * i);
            const parentId = reachableIds[parentIndex];
            if (!currentId || !parentId) {
              continue;
            }
            nodes.push({ id: currentId, type: "scene", title: currentId });
            edges.push({
              id: `edge_${parentId}_${currentId}`,
              from: parentId,
              to: currentId,
            });
          }

          for (let j = 0; j < unreachableCount; j++) {
            nodes.push({
              id: `unreachable_${j}`,
              type: "scene",
              title: `Unreachable ${j}`,
            });
          }

          const project: Project = {
            id: "proj_prop",
            name: "Property Project",
            nodes,
            edges,
          };

          const result = findUnreachableNodes(project);

          for (const reachableId of reachableIds) {
            expect(result).not.toContain(reachableId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
