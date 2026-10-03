import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { FlowEdge, FlowNode, FlowNodeType, Project } from "@repo/schema";
import {
  check,
  findNodesThatCannotReachEnd,
  findUnreachableNodes,
} from "./index.js";


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

describe("findNodesThatCannotReachEnd", () => {
  it("linear: all nodes leading to end return empty array", () => {
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

    expect(findNodesThatCannotReachEnd(project)).toEqual([]);
  });

  it("branching: reports branch that does not reach end", () => {
    const project: Project = {
      id: "p2",
      name: "Branching",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "sceneA", type: "scene", title: "Scene A" },
        { id: "sceneB", type: "scene", title: "Scene B" },
        { id: "end", type: "end", title: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "sceneA" },
        { id: "e2", from: "start", to: "sceneB" },
        { id: "e3", from: "sceneA", to: "end" },
      ],
    };

    expect(findNodesThatCannotReachEnd(project)).toEqual(["sceneB"]);
  });

  it("trap cycle with no exit toward an end: reports cycle and ancestors", () => {
    const project: Project = {
      id: "p3",
      name: "Trap Cycle",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "scene1", type: "scene", title: "Scene 1" },
        { id: "loopA", type: "scene", title: "Loop A" },
        { id: "loopB", type: "scene", title: "Loop B" },
        { id: "end", type: "end", title: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "scene1" },
        { id: "e2", from: "scene1", to: "loopA" },
        { id: "e3", from: "loopA", to: "loopB" },
        { id: "e4", from: "loopB", to: "loopA" },
      ],
    };

    expect(findNodesThatCannotReachEnd(project)).toEqual([
      "start",
      "scene1",
      "loopA",
      "loopB",
    ]);
  });

  it("node with no outgoing edge: reports dead end node", () => {
    const project: Project = {
      id: "p4",
      name: "Dead End",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "deadNode", type: "scene", title: "Dead Node" },
        { id: "sceneOk", type: "scene", title: "Scene Ok" },
        { id: "end", type: "end", title: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "deadNode" },
        { id: "e2", from: "start", to: "sceneOk" },
        { id: "e3", from: "sceneOk", to: "end" },
      ],
    };

    expect(findNodesThatCannotReachEnd(project)).toEqual(["deadNode"]);
  });

  it("no end nodes: returns all node ids in project.nodes order", () => {
    const project: Project = {
      id: "p5",
      name: "No End",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "scene1", type: "scene", title: "Scene 1" },
        { id: "scene2", type: "scene", title: "Scene 2" },
      ],
      edges: [
        { id: "e1", from: "start", to: "scene1" },
        { id: "e2", from: "scene1", to: "scene2" },
      ],
    };

    expect(findNodesThatCannotReachEnd(project)).toEqual(["start", "scene1", "scene2"]);
  });

  it("dangling edge: ignores edges referencing nonexistent nodes", () => {
    const project: Project = {
      id: "p6",
      name: "Dangling",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "scene1", type: "scene", title: "Scene 1" },
        { id: "end", type: "end", title: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "scene1" },
        { id: "e2", from: "scene1", to: "ghostNode" },
        { id: "e3", from: "ghostNode", to: "end" },
      ],
    };

    expect(findNodesThatCannotReachEnd(project)).toEqual(["start", "scene1"]);
  });

  it("end node itself: end nodes are never reported", () => {
    const project: Project = {
      id: "p7",
      name: "End Nodes",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "end1", type: "end", title: "End 1" },
        { id: "end2", type: "end", title: "End 2" },
      ],
      edges: [{ id: "e1", from: "start", to: "end1" }],
    };

    expect(findNodesThatCannotReachEnd(project)).toEqual([]);
  });

  it("multiple end nodes: reaches any end node is sufficient", () => {
    const project: Project = {
      id: "p8",
      name: "Multiple Ends",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "branchA", type: "scene", title: "Branch A" },
        { id: "branchB", type: "scene", title: "Branch B" },
        { id: "orphanScene", type: "scene", title: "Orphan Scene" },
        { id: "end1", type: "end", title: "End 1" },
        { id: "end2", type: "end", title: "End 2" },
      ],
      edges: [
        { id: "e1", from: "start", to: "branchA" },
        { id: "e2", from: "start", to: "branchB" },
        { id: "e3", from: "branchA", to: "end1" },
        { id: "e4", from: "branchB", to: "end2" },
      ],
    };

    expect(findNodesThatCannotReachEnd(project)).toEqual(["orphanScene"]);
  });
});

describe("check", () => {
  it("severities: unreachable-from-start is warning, cannot-reach-end is error", () => {
    const project: Project = {
      id: "p_sev",
      name: "Severities",
      nodes: [
        { id: "start", type: "start", title: "Start Node" },
        { id: "island", type: "scene", title: "Island Node" },
        { id: "dead", type: "scene", title: "Dead Node" },
        { id: "end", type: "end", title: "End Node" },
      ],
      edges: [
        { id: "e1", from: "start", to: "dead" },
        { id: "e2", from: "island", to: "end" },
      ],
    };

    const issues = check(project);
    const islandIssue = issues.find((i) => i.nodeId === "island");
    const deadIssue = issues.find((i) => i.nodeId === "dead");

    expect(islandIssue?.ruleId).toBe("unreachable-from-start");
    expect(islandIssue?.severity).toBe("warning");

    expect(deadIssue?.ruleId).toBe("cannot-reach-end");
    expect(deadIssue?.severity).toBe("error");
  });

  it("messages contain titles: each issue message includes node title", () => {
    const project: Project = {
      id: "p_msg",
      name: "Messages",
      nodes: [
        { id: "start", type: "start", title: "The Beginning" },
        { id: "lonely", type: "scene", title: "Forgotten Crypt" },
        { id: "end", type: "end", title: "The Finish" },
      ],
      edges: [{ id: "e1", from: "start", to: "end" }],
    };

    const issues = check(project);
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      const node = project.nodes.find((n) => n.id === issue.nodeId);
      expect(node).toBeDefined();
      if (node) {
        expect(issue.message).toContain(node.title);
      }
    }

  });

  it("ordering: ordered by project.nodes order, then rule order", () => {
    const project: Project = {
      id: "p_ord",
      name: "Ordering",
      nodes: [
        { id: "nodeA", type: "scene", title: "Node A" },
        { id: "start", type: "start", title: "Start Node" },
        { id: "scene1", type: "scene", title: "Scene 1" },
        { id: "nodeB", type: "scene", title: "Node B" },
        { id: "end", type: "end", title: "End Node" },
      ],
      edges: [
        { id: "e1", from: "start", to: "scene1" },
        { id: "e2", from: "scene1", to: "end" },
        { id: "e3", from: "scene1", to: "nodeB" },
      ],
    };


    const issues = check(project);
    expect(issues).toEqual([
      {
        ruleId: "unreachable-from-start",
        severity: "warning",
        nodeId: "nodeA",
        message: expect.stringContaining("Node A"),
      },
      {
        ruleId: "cannot-reach-end",
        severity: "error",
        nodeId: "nodeA",
        message: expect.stringContaining("Node A"),
      },
      {
        ruleId: "cannot-reach-end",
        severity: "error",
        nodeId: "nodeB",
        message: expect.stringContaining("Node B"),
      },
    ]);
  });

  it("clean graph returns empty array", () => {
    const project: Project = {
      id: "p_clean",
      name: "Clean",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "scene", type: "scene", title: "Scene" },
        { id: "end", type: "end", title: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "scene" },
        { id: "e2", from: "scene", to: "end" },
      ],
    };

    expect(check(project)).toEqual([]);
  });
});

describe("property tests", () => {
  function naiveFindUnreachableNodesFixpoint(project: Project): string[] {
    const existingNodeIds = new Set(project.nodes.map((n) => n.id));
    const startNodeIds = project.nodes
      .filter((n) => n.type === "start")
      .map((n) => n.id);
    if (startNodeIds.length === 0) {
      return project.nodes.map((n) => n.id);
    }

    const reachable = new Set<string>(startNodeIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of project.edges) {
        if (existingNodeIds.has(edge.from) && existingNodeIds.has(edge.to)) {
          if (reachable.has(edge.from) && !reachable.has(edge.to)) {
            reachable.add(edge.to);
            changed = true;
          }
        }
      }
    }

    return project.nodes
      .filter((n) => n.type !== "start" && !reachable.has(n.id))
      .map((n) => n.id);
  }

  function naiveFindNodesThatCannotReachEndFixpoint(project: Project): string[] {
    const existingNodeIds = new Set(project.nodes.map((n) => n.id));
    const endNodeIds = project.nodes
      .filter((n) => n.type === "end")
      .map((n) => n.id);
    if (endNodeIds.length === 0) {
      return project.nodes.map((n) => n.id);
    }

    const canReachEnd = new Set<string>(endNodeIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of project.edges) {
        if (existingNodeIds.has(edge.from) && existingNodeIds.has(edge.to)) {
          if (canReachEnd.has(edge.to) && !canReachEnd.has(edge.from)) {
            canReachEnd.add(edge.from);
            changed = true;
          }
        }
      }
    }

    return project.nodes
      .filter((n) => n.type !== "end" && !canReachEnd.has(n.id))
      .map((n) => n.id);
  }

  const randomProjectArbitrary = fc
    .integer({ min: 1, max: 12 })
    .chain((nodeCount) => {
      const ids = Array.from({ length: nodeCount }, (_, i) => `n_${i}`);
      return fc
        .record({
          nodeTypes: fc.array(
            fc.constantFrom<FlowNodeType>("start", "scene", "end"),
            {
              minLength: nodeCount,
              maxLength: nodeCount,
            },
          ),
          edges: fc.array(
            fc.record({
              id: fc.uuid(),
              from: fc.constantFrom(...ids, "ghost_src"),
              to: fc.constantFrom(...ids, "ghost_dst"),
            }),
            { maxLength: 20 },
          ),
        })
        .map(({ nodeTypes, edges }) => {
          const nodes: FlowNode[] = ids.map((id, index) => ({
            id,
            type: nodeTypes[index] ?? "scene",
            title: `Title ${id}`,
          }));
          return {
            id: "proj_rnd",
            name: "Random",
            nodes,
            edges,
          } satisfies Project;
        });
    });

  it("Property test A (differential): both rules match naive fixpoint implementation on random graphs", () => {
    fc.assert(
      fc.property(randomProjectArbitrary, (project) => {
        const actualUnreachable = findUnreachableNodes(project);
        const expectedUnreachable = naiveFindUnreachableNodesFixpoint(project);
        expect(actualUnreachable).toEqual(expectedUnreachable);

        const actualCannotReachEnd = findNodesThatCannotReachEnd(project);
        const expectedCannotReachEnd =
          naiveFindNodesThatCannotReachEndFixpoint(project);
        expect(actualCannotReachEnd).toEqual(expectedCannotReachEnd);
      }),
      { numRuns: 100 },
    );
  });

  it("Property test B: check() never references nonexistent node id and never returns duplicate (ruleId, nodeId) pairs", () => {
    fc.assert(
      fc.property(randomProjectArbitrary, (project) => {
        const issues = check(project);
        const existingNodeIds = new Set(project.nodes.map((n) => n.id));
        const seenPairs = new Set<string>();

        for (const issue of issues) {
          expect(existingNodeIds.has(issue.nodeId)).toBe(true);

          const key = `${issue.ruleId}:${issue.nodeId}`;
          expect(seenPairs.has(key)).toBe(false);
          seenPairs.add(key);
        }
      }),
      { numRuns: 100 },
    );
  });
});

