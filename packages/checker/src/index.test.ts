import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { FlowEdge, FlowNode, FlowNodeType, Project, Variable } from "@repo/schema";
import { IssueSchema, VariableSchema } from "@repo/schema";
import { parseCondition, parseEffect } from "@repo/dsl";
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
            variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
      variables: [],
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
            variables: [],
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
          expect(
            (issue.nodeId !== undefined) !== (issue.variableId !== undefined),
          ).toBe(true);
          if (issue.nodeId !== undefined) {
            expect(existingNodeIds.has(issue.nodeId)).toBe(true);
          }

          const key = `${issue.ruleId}:${issue.nodeId ?? ""}:${issue.variableId ?? ""}:${issue.location?.edgeId ?? ""}:${issue.location?.field ?? ""}:${issue.location?.effectIndex ?? ""}:${issue.location?.start ?? ""}:${issue.location?.end ?? ""}`;
          expect(seenPairs.has(key)).toBe(false);
          seenPairs.add(key);
        }
      }),
      { numRuns: 100 },
    );
  });

  describe("new rules: invalid-expression, undefined-variable, type-mismatch", () => {
    const baseNodes: FlowNode[] = [
      { id: "start", type: "start", title: "Start Node" },
      { id: "end", type: "end", title: "End Node" },
    ];

    it("valid edge condition and effects produce no issues", () => {
      const project: Project = {
        id: "p1",
        name: "Valid Edge",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            condition: 'x > 0 && msg == "ok"',
            effects: ["x += 1", 'msg = "ok"'],
          },
        ],
        variables: [
          { id: "v1", name: "x", type: "number" },
          { id: "v2", name: "msg", type: "string" },
        ],
      };
      const issues = check(project);
      expect(issues).toHaveLength(0);
    });

    it("blank condition and blank effect entries are skipped", () => {
      const project: Project = {
        id: "p2",
        name: "Blank Fields",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            condition: "   ",
            effects: ["", "   "],
          },
        ],
        variables: [],
      };
      const issues = check(project);
      expect(issues).toHaveLength(0);
    });

    it("edge with missing from node is skipped", () => {
      const project: Project = {
        id: "p3",
        name: "Missing From",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "ghost_from",
            to: "end",
            condition: "invalid !@#$",
            effects: ["invalid !@#$"],
          },
        ],
        variables: [],
      };
      const issues = check(project);
      // Only reachability issue for start not reaching end if any, but no edge issues
      const edgeIssues = issues.filter((i) => i.location !== undefined);
      expect(edgeIssues).toHaveLength(0);
    });

    it("duplicate variable names: first-wins", () => {
      const project: Project = {
        id: "p4",
        name: "Duplicate Vars",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            condition: "x + 1 > 0",
          },
        ],
        variables: [
          { id: "v1", name: "x", type: "number" },
          { id: "v2", name: "x", type: "string" },
        ],
      };
      const issues = check(project);
      const edgeIssues = issues.filter((i) => i.location !== undefined);
      expect(edgeIssues).toHaveLength(0);
    });

    it("parse error in condition produces invalid-expression with location and node title in message", () => {
      const project: Project = {
        id: "p5",
        name: "Parse Error Cond",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            condition: "x +",
          },
        ],
        variables: [{ id: "v1", name: "x", type: "number" }],
      };
      const issues = check(project);
      const invalid = issues.filter((i) => i.ruleId === "invalid-expression");
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.severity).toBe("error");
      expect(invalid[0]?.nodeId).toBe("start");
      expect(invalid[0]?.message).toContain("Start Node");
      expect(invalid[0]?.location).toEqual({
        edgeId: "e1",
        field: "condition",
        start: 3,
        end: 3,
      });
    });

    it("parse error in effects produces invalid-expression with effectIndex", () => {
      const project: Project = {
        id: "p6",
        name: "Parse Error Effect",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            effects: ["x = 1", "y =="],
          },
        ],
        variables: [
          { id: "v1", name: "x", type: "number" },
          { id: "v2", name: "y", type: "number" },
        ],
      };
      const issues = check(project);
      const invalid = issues.filter((i) => i.ruleId === "invalid-expression");
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.location).toEqual({
        edgeId: "e1",
        field: "effect",
        effectIndex: 1,
        start: 2,
        end: 4,
      });
    });

    it("undefined variable produces undefined-variable issue naming the variable and node title", () => {
      const project: Project = {
        id: "p7",
        name: "Undef Var",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            condition: "ghost > 0",
          },
        ],
        variables: [],
      };
      const issues = check(project);
      const undef = issues.filter((i) => i.ruleId === "undefined-variable");
      expect(undef).toHaveLength(1);
      expect(undef[0]?.severity).toBe("error");
      expect(undef[0]?.nodeId).toBe("start");
      expect(undef[0]?.message).toContain("Start Node");
      expect(undef[0]?.message).toContain("ghost");
      expect(undef[0]?.location).toEqual({
        edgeId: "e1",
        field: "condition",
        start: 0,
        end: 5,
      });
    });

    it("type mismatch produces type-mismatch issue with severity error", () => {
      const project: Project = {
        id: "p8",
        name: "Type Mismatch",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            condition: "x + y > 0",
          },
        ],
        variables: [
          { id: "v1", name: "x", type: "number" },
          { id: "v2", name: "y", type: "string" },
        ],
      };
      const issues = check(project);
      const mismatch = issues.filter((i) => i.ruleId === "type-mismatch");
      expect(mismatch).toHaveLength(1);
      expect(mismatch[0]?.severity).toBe("error");
      expect(mismatch[0]?.nodeId).toBe("start");
      expect(mismatch[0]?.message).toContain("Start Node");
      expect(mismatch[0]?.location).toEqual({
        edgeId: "e1",
        field: "condition",
        start: 0,
        end: 5,
      });
    });

    it("ordering: node-based first, then edges order, condition before effects, effects by index, within each by start offset", () => {
      const project: Project = {
        id: "p9",
        name: "Ordering",
        nodes: [
          { id: "start", type: "start", title: "Start" },
          { id: "orphan", type: "scene", title: "Orphan" },
          { id: "end", type: "end", title: "End" },
        ],
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            condition: "undef1 + undef2 > 0",
            effects: ["x = 10", "undef3 = 1"],
          },
          {
            id: "e2",
            from: "start",
            to: "end",
            condition: "1 + 2", // type mismatch
          },
        ],
        variables: [
          { id: "v1", name: "x", type: "string" },
          { id: "v2", name: "unused_var", type: "number" },
        ],
      };

      const issues = check(project);
      const mapped = issues.map((i) => ({
        ruleId: i.ruleId,
        nodeId: i.nodeId,
        variableId: i.variableId,
        edgeId: i.location?.edgeId,
        field: i.location?.field,
        effectIndex: i.location?.effectIndex,
        start: i.location?.start,
      }));

      expect(mapped).toEqual([
        {
          ruleId: "unreachable-from-start",
          nodeId: "orphan",
          variableId: undefined,
          edgeId: undefined,
          field: undefined,
          effectIndex: undefined,
          start: undefined,
        },
        {
          ruleId: "cannot-reach-end",
          nodeId: "orphan",
          variableId: undefined,
          edgeId: undefined,
          field: undefined,
          effectIndex: undefined,
          start: undefined,
        },
        {
          ruleId: "undefined-variable",
          nodeId: "start",
          variableId: undefined,
          edgeId: "e1",
          field: "condition",
          effectIndex: undefined,
          start: 0,
        },
        {
          ruleId: "undefined-variable",
          nodeId: "start",
          variableId: undefined,
          edgeId: "e1",
          field: "condition",
          effectIndex: undefined,
          start: 9,
        },
        {
          ruleId: "type-mismatch",
          nodeId: "start",
          variableId: undefined,
          edgeId: "e1",
          field: "effect",
          effectIndex: 0,
          start: 4,
        },
        {
          ruleId: "undefined-variable",
          nodeId: "start",
          variableId: undefined,
          edgeId: "e1",
          field: "effect",
          effectIndex: 1,
          start: 0,
        },
        {
          ruleId: "type-mismatch",
          nodeId: "start",
          variableId: undefined,
          edgeId: "e2",
          field: "condition",
          effectIndex: undefined,
          start: 0,
        },
        {
          ruleId: "variable-never-read",
          nodeId: undefined,
          variableId: "v1",
          edgeId: undefined,
          field: undefined,
          effectIndex: undefined,
          start: undefined,
        },
        {
          ruleId: "unused-variable",
          nodeId: undefined,
          variableId: "v2",
          edgeId: undefined,
          field: undefined,
          effectIndex: undefined,
          start: undefined,
        },
      ]);
    });
  });

  describe("Property C1 (robustness with random expressions)", () => {
    const randomProjectWithExprsArbitrary = fc
      .integer({ min: 1, max: 8 })
      .chain((nodeCount) => {
        const ids = Array.from({ length: nodeCount }, (_, i) => `n_${i}`);
        return fc
          .record({
            nodeTypes: fc.array(
              fc.constantFrom<FlowNodeType>("start", "scene", "end"),
              { minLength: nodeCount, maxLength: nodeCount },
            ),
            edges: fc.array(
              fc.record({
                id: fc.uuid(),
                from: fc.constantFrom(...ids, "ghost_src"),
                to: fc.constantFrom(...ids, "ghost_dst"),
                condition: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
                effects: fc.option(fc.array(fc.string({ maxLength: 50 }), { maxLength: 3 }), {
                  nil: undefined,
                }),
              }),
              { maxLength: 10 },
            ),
            variables: fc.array(
              fc.record({
                id: fc.uuid(),
                name: fc
                  .stringMatching(/^[a-z][a-z0-9_]{0,4}$/)
                  .filter((s) => s !== "true" && s !== "false"),
                type: fc.constantFrom<Variable["type"]>("number", "string", "boolean"),
              }),
              { maxLength: 5 },
            ),
          })
          .map(({ nodeTypes, edges, variables }) => {
            const nodes: FlowNode[] = ids.map((id, index) => ({
              id,
              type: nodeTypes[index] ?? "scene",
              title: `Title ${id}`,
            }));
            return {
              id: "proj_rnd_expr",
              name: "Random Expr Project",
              nodes,
              edges,
              variables,
            } satisfies Project;
          });
      });

    it("Property C1: check() never throws on arbitrary expressions, and location invariants hold", () => {
      fc.assert(
        fc.property(randomProjectWithExprsArbitrary, (project) => {
          const issues = check(project);
          const validEdgeIds = new Set(project.edges.map((e) => e.id));

          for (const issue of issues) {
            if (issue.location) {
              expect(validEdgeIds.has(issue.location.edgeId)).toBe(true);
              expect(issue.location.start).toBeGreaterThanOrEqual(0);
              expect(issue.location.end).toBeGreaterThanOrEqual(issue.location.start);
            }
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("schema refinements: IssueSchema and VariableSchema", () => {
    describe("IssueSchema exactly-one-of nodeId/variableId refinement", () => {
      it("accepts issue with nodeId only", () => {
        const parsed = IssueSchema.safeParse({
          ruleId: "unreachable-from-start",
          severity: "warning",
          nodeId: "n1",
          message: "Node n1 is unreachable",
        });
        expect(parsed.success).toBe(true);
      });

      it("accepts issue with variableId only", () => {
        const parsed = IssueSchema.safeParse({
          ruleId: "unused-variable",
          severity: "warning",
          variableId: "v1",
          message: 'Variable "x" is declared but never used.',
        });
        expect(parsed.success).toBe(true);
      });

      it("rejects issue with both nodeId and variableId present", () => {
        const parsed = IssueSchema.safeParse({
          ruleId: "unused-variable",
          severity: "warning",
          nodeId: "n1",
          variableId: "v1",
          message: "Conflict",
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
          const messages = parsed.error.issues.map((i) => i.message);
          expect(messages).toContain("Exactly one of nodeId or variableId must be present");
        }
      });

      it("rejects issue with neither nodeId nor variableId present", () => {
        const parsed = IssueSchema.safeParse({
          ruleId: "unused-variable",
          severity: "warning",
          message: "Neither",
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
          const messages = parsed.error.issues.map((i) => i.message);
          expect(messages).toContain("Exactly one of nodeId or variableId must be present");
        }
      });
    });

    describe("VariableSchema initial value refinement", () => {
      it("accepts variable without initial value", () => {
        const parsed = VariableSchema.safeParse({
          id: "v1",
          name: "count",
          type: "number",
        });
        expect(parsed.success).toBe(true);
      });

      it("accepts matching initial types", () => {
        expect(
          VariableSchema.safeParse({ id: "v1", name: "n", type: "number", initial: 42 }).success,
        ).toBe(true);
        expect(
          VariableSchema.safeParse({ id: "v2", name: "s", type: "string", initial: "hello" }).success,
        ).toBe(true);
        expect(
          VariableSchema.safeParse({ id: "v3", name: "b", type: "boolean", initial: false }).success,
        ).toBe(true);
      });

      it("rejects mismatched initial types", () => {
        expect(
          VariableSchema.safeParse({ id: "v1", name: "n", type: "number", initial: "42" }).success,
        ).toBe(false);
        expect(
          VariableSchema.safeParse({ id: "v2", name: "s", type: "string", initial: 123 }).success,
        ).toBe(false);
        expect(
          VariableSchema.safeParse({ id: "v3", name: "b", type: "boolean", initial: "true" }).success,
        ).toBe(false);
      });

      it("rejects non-finite number initial values", () => {
        expect(
          VariableSchema.safeParse({ id: "v1", name: "n", type: "number", initial: NaN }).success,
        ).toBe(false);
        expect(
          VariableSchema.safeParse({ id: "v2", name: "n", type: "number", initial: Infinity }).success,
        ).toBe(false);
        expect(
          VariableSchema.safeParse({ id: "v3", name: "n", type: "number", initial: -Infinity }).success,
        ).toBe(false);
      });
    });
  });

  describe("variable-usage analysis", () => {
    const baseNodes: FlowNode[] = [
      { id: "start", type: "start", title: "Start Node" },
      { id: "end", type: "end", title: "End Node" },
    ];

    it("read-only with initial produces no usage issue", () => {
      const project: Project = {
        id: "p_init_read",
        name: "Initial Read Only",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            condition: "x > 0",
          },
        ],
        variables: [{ id: "v1", name: "x", type: "number", initial: 10 }],
      };

      const issues = check(project);
      const usageIssues = issues.filter(
        (i) =>
          i.ruleId === "unused-variable" ||
          i.ruleId === "variable-never-written" ||
          i.ruleId === "variable-never-read",
      );
      expect(usageIssues).toEqual([]);
    });

    it("read-only without initial produces variable-never-written", () => {
      const project: Project = {
        id: "p_no_init_read",
        name: "No Initial Read Only",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            condition: "x > 0",
          },
        ],
        variables: [{ id: "v1", name: "x", type: "number" }],
      };

      const issues = check(project);
      const usageIssues = issues.filter(
        (i) =>
          i.ruleId === "unused-variable" ||
          i.ruleId === "variable-never-written" ||
          i.ruleId === "variable-never-read",
      );
      expect(usageIssues).toEqual([
        {
          ruleId: "variable-never-written",
          severity: "warning",
          variableId: "v1",
          message: 'Variable "x" is read but never written.',
        },
      ]);
    });

    it("write-only produces variable-never-read", () => {
      const project: Project = {
        id: "p_write_only",
        name: "Write Only",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            effects: ["x = 5"],
          },
        ],
        variables: [{ id: "v1", name: "x", type: "number", initial: 0 }],
      };

      const issues = check(project);
      const usageIssues = issues.filter(
        (i) =>
          i.ruleId === "unused-variable" ||
          i.ruleId === "variable-never-written" ||
          i.ruleId === "variable-never-read",
      );
      expect(usageIssues).toEqual([
        {
          ruleId: "variable-never-read",
          severity: "warning",
          variableId: "v1",
          message: 'Variable "x" is written but never read.',
        },
      ]);
    });

    it("neither read nor written produces unused-variable", () => {
      const project: Project = {
        id: "p_unused",
        name: "Unused",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
          },
        ],
        variables: [{ id: "v1", name: "x", type: "number", initial: 0 }],
      };

      const issues = check(project);
      const usageIssues = issues.filter(
        (i) =>
          i.ruleId === "unused-variable" ||
          i.ruleId === "variable-never-written" ||
          i.ruleId === "variable-never-read",
      );
      expect(usageIssues).toEqual([
        {
          ruleId: "unused-variable",
          severity: "warning",
          variableId: "v1",
          message: 'Variable "x" is declared but never used.',
        },
      ]);
    });

    it("both read and written produces no usage issue", () => {
      const project: Project = {
        id: "p_both",
        name: "Both Read and Written",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            condition: "x > 0",
            effects: ["x = 1"],
          },
        ],
        variables: [{ id: "v1", name: "x", type: "number" }],
      };

      const issues = check(project);
      const usageIssues = issues.filter(
        (i) =>
          i.ruleId === "unused-variable" ||
          i.ruleId === "variable-never-written" ||
          i.ruleId === "variable-never-read",
      );
      expect(usageIssues).toEqual([]);
    });

    it("compound assignment x += 1 alone produces variable-never-read", () => {
      const project: Project = {
        id: "p_compound",
        name: "Compound Write",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            effects: ["x += 1"],
          },
        ],
        variables: [{ id: "v1", name: "x", type: "number", initial: 0 }],
      };

      const issues = check(project);
      const usageIssues = issues.filter(
        (i) =>
          i.ruleId === "unused-variable" ||
          i.ruleId === "variable-never-written" ||
          i.ruleId === "variable-never-read",
      );
      expect(usageIssues).toEqual([
        {
          ruleId: "variable-never-read",
          severity: "warning",
          variableId: "v1",
          message: 'Variable "x" is written but never read.',
        },
      ]);
    });

    it("assignment reading self x = x + 1 produces no usage issue", () => {
      const project: Project = {
        id: "p_self_assign",
        name: "Self Assignment",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            effects: ["x = x + 1"],
          },
        ],
        variables: [{ id: "v1", name: "x", type: "number" }],
      };

      const issues = check(project);
      const usageIssues = issues.filter(
        (i) =>
          i.ruleId === "unused-variable" ||
          i.ruleId === "variable-never-written" ||
          i.ruleId === "variable-never-read",
      );
      expect(usageIssues).toEqual([]);
    });

    it("single unparseable string anywhere suppresses all usage issues", () => {
      const project: Project = {
        id: "p_suppress",
        name: "Parse Error Suppression",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            condition: "@@bad_syntax@@",
          },
        ],
        variables: [
          { id: "v1", name: "unused_var", type: "number" },
          { id: "v2", name: "written_var", type: "number" },
        ],
      };

      const issues = check(project);
      const usageIssues = issues.filter(
        (i) =>
          i.ruleId === "unused-variable" ||
          i.ruleId === "variable-never-written" ||
          i.ruleId === "variable-never-read",
      );
      expect(usageIssues).toEqual([]);
      expect(issues.some((i) => i.ruleId === "invalid-expression")).toBe(true);
    });

    it("reachability limitation: usage on edge from orphan node counts and produces no usage issue", () => {
      const project: Project = {
        id: "p_orphan_reachability",
        name: "Orphan Reachability",
        nodes: [
          ...baseNodes,
          { id: "orphan", type: "scene", title: "Orphan Node" },
        ],
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
          },
          {
            id: "e2",
            from: "orphan",
            to: "end",
            condition: "orphan_var > 0",
            effects: ["orphan_var = 10"],
          },
        ],
        variables: [{ id: "v1", name: "orphan_var", type: "number" }],
      };

      const issues = check(project);
      const usageIssues = issues.filter(
        (i) =>
          i.ruleId === "unused-variable" ||
          i.ruleId === "variable-never-written" ||
          i.ruleId === "variable-never-read",
      );
      expect(usageIssues).toEqual([]);
      expect(issues.some((i) => i.ruleId === "unreachable-from-start" && i.nodeId === "orphan")).toBe(
        true,
      );
    });

    it("dangling edge (missing from node) still counts usage", () => {
      const project: Project = {
        id: "p_dangling_edge",
        name: "Dangling Edge",
        nodes: baseNodes,
        edges: [
          {
            id: "e_dangling",
            from: "nonexistent_node",
            to: "end",
            condition: "dangling_var > 0",
            effects: ["dangling_var = 1"],
          },
        ],
        variables: [{ id: "v1", name: "dangling_var", type: "number" }],
      };

      const issues = check(project);
      const usageIssues = issues.filter(
        (i) =>
          i.ruleId === "unused-variable" ||
          i.ruleId === "variable-never-written" ||
          i.ruleId === "variable-never-read",
      );
      expect(usageIssues).toEqual([]);
    });

    it("duplicate variable names: first declared variable wins", () => {
      const projectUnused: Project = {
        id: "p_dup_unused",
        name: "Duplicate Unused",
        nodes: baseNodes,
        edges: [{ id: "e1", from: "start", to: "end" }],
        variables: [
          { id: "v1", name: "dup", type: "number" },
          { id: "v2", name: "dup", type: "number" },
        ],
      };

      const issuesUnused = check(projectUnused);
      const usageUnused = issuesUnused.filter(
        (i) =>
          i.ruleId === "unused-variable" ||
          i.ruleId === "variable-never-written" ||
          i.ruleId === "variable-never-read",
      );
      expect(usageUnused).toEqual([
        {
          ruleId: "unused-variable",
          severity: "warning",
          variableId: "v1",
          message: 'Variable "dup" is declared but never used.',
        },
      ]);

      const projectUsed: Project = {
        id: "p_dup_used",
        name: "Duplicate Used",
        nodes: baseNodes,
        edges: [
          {
            id: "e1",
            from: "start",
            to: "end",
            condition: "dup > 0",
            effects: ["dup = 10"],
          },
        ],
        variables: [
          { id: "v1", name: "dup", type: "number" },
          { id: "v2", name: "dup", type: "number" },
        ],
      };

      const issuesUsed = check(projectUsed);
      const usageUsed = issuesUsed.filter(
        (i) =>
          i.ruleId === "unused-variable" ||
          i.ruleId === "variable-never-written" ||
          i.ruleId === "variable-never-read",
      );
      expect(usageUsed).toEqual([]);
    });
  });

  describe("Property U1 (differential testing of variable usage)", () => {
    type VariableRole = "unused" | "read-only" | "write-only" | "read-and-write";

    interface VarGenSpec {
      id: string;
      name: string;
      type: "number" | "boolean";
      hasInitial: boolean;
      role: VariableRole;
    }

    const varGenArbitrary = fc
      .array(
        fc.record({
          role: fc.constantFrom<VariableRole>(
            "unused",
            "read-only",
            "write-only",
            "read-and-write",
          ),
          type: fc.constantFrom<"number" | "boolean">("number", "boolean"),
          hasInitial: fc.boolean(),
        }),
        { minLength: 1, maxLength: 8 },
      )
      .map((specs) => {
        return specs.map<VarGenSpec>((spec, idx) => ({
          ...spec,
          id: `var_${idx}`,
          name: `v_${idx}`,
        }));
      });

    it("Property U1: checker usage rules match independent specification", () => {
      fc.assert(
        fc.property(varGenArbitrary, (specs) => {
          const variables: Variable[] = specs.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            initial: s.hasInitial
              ? s.type === "number"
                ? 100
                : true
              : undefined,
          }));

          const conditions: string[] = [];
          const effects: string[] = [];

          for (const s of specs) {
            const lit = s.type === "number" ? "1" : "true";
            switch (s.role) {
              case "unused":
                break;
              case "read-only":
                conditions.push(`${s.name} == ${lit}`);
                break;
              case "write-only":
                effects.push(`${s.name} = ${lit}`);
                break;
              case "read-and-write":
                conditions.push(`${s.name} == ${lit}`);
                effects.push(`${s.name} = ${lit}`);
                break;
            }
          }

          // Assert every generated condition and effect parses successfully
          for (const cond of conditions) {
            const parsed = parseCondition(cond);
            expect(parsed.ok).toBe(true);
          }
          for (const eff of effects) {
            const parsed = parseEffect(eff);
            expect(parsed.ok).toBe(true);
          }

          const project: Project = {
            id: "proj_u1",
            name: "Property U1 Project",
            nodes: [
              { id: "start", type: "start", title: "Start" },
              { id: "end", type: "end", title: "End" },
            ],
            edges: [
              {
                id: "e1",
                from: "start",
                to: "end",
                condition: conditions.length > 0 ? conditions.join(" && ") : undefined,
                effects: effects.length > 0 ? effects : undefined,
              },
            ],
            variables,
          };

          if (project.edges[0]?.condition) {
            expect(parseCondition(project.edges[0].condition).ok).toBe(true);
          }

          // Independent expected value computation purely from VarGenSpec
          const expectedUsageIssues: {
            ruleId: string;
            severity: string;
            variableId: string;
            message: string;
          }[] = [];

          for (const s of specs) {
            const read = s.role === "read-only" || s.role === "read-and-write";
            const written = s.role === "write-only" || s.role === "read-and-write";

            if (!read && !written) {
              expectedUsageIssues.push({
                ruleId: "unused-variable",
                severity: "warning",
                variableId: s.id,
                message: `Variable "${s.name}" is declared but never used.`,
              });
            } else if (read && !written && !s.hasInitial) {
              expectedUsageIssues.push({
                ruleId: "variable-never-written",
                severity: "warning",
                variableId: s.id,
                message: `Variable "${s.name}" is read but never written.`,
              });
            } else if (written && !read) {
              expectedUsageIssues.push({
                ruleId: "variable-never-read",
                severity: "warning",
                variableId: s.id,
                message: `Variable "${s.name}" is written but never read.`,
              });
            }
          }

          const actualIssues = check(project);
          const actualUsageIssues = actualIssues
            .filter(
              (i) =>
                i.ruleId === "unused-variable" ||
                i.ruleId === "variable-never-written" ||
                i.ruleId === "variable-never-read",
            )
            .map((i) => ({
              ruleId: i.ruleId,
              severity: i.severity,
              variableId: i.variableId ?? "",
              message: i.message,
            }));

          expect(actualUsageIssues).toEqual(expectedUsageIssues);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Property U2 (robustness on arbitrary projects with variables and expressions)", () => {
    const arbitraryProjectWithVariables = fc
      .integer({ min: 1, max: 6 })
      .chain((nodeCount) => {
        const ids = Array.from({ length: nodeCount }, (_, i) => `n_${i}`);
        return fc
          .record({
            nodeTypes: fc.array(
              fc.constantFrom<FlowNodeType>("start", "scene", "end"),
              { minLength: nodeCount, maxLength: nodeCount },
            ),
            edges: fc.array(
              fc.record({
                id: fc.uuid(),
                from: fc.constantFrom(...ids, "orphan_src", "ghost_src"),
                to: fc.constantFrom(...ids, "orphan_dst", "ghost_dst"),
                condition: fc.option(fc.string({ maxLength: 40 }), { nil: undefined }),
                effects: fc.option(fc.array(fc.string({ maxLength: 40 }), { maxLength: 3 }), {
                  nil: undefined,
                }),
              }),
              { maxLength: 8 },
            ),
            variables: fc.array(
              fc.record({
                id: fc.uuid(),
                name: fc
                  .stringMatching(/^[a-z][a-z0-9_]{0,3}$/)
                  .filter((s) => s !== "true" && s !== "false"),
                type: fc.constantFrom<Variable["type"]>("number", "string", "boolean"),
                initial: fc.option(
                  fc.oneof(fc.integer({ min: -100, max: 100 }), fc.string({ maxLength: 10 }), fc.boolean()),
                  { nil: undefined },
                ),
              }).filter((v) => {
                // Ensure initial type matches variable type if present
                if (v.initial === undefined) return true;
                if (v.type === "number") return typeof v.initial === "number";
                if (v.type === "string") return typeof v.initial === "string";
                if (v.type === "boolean") return typeof v.initial === "boolean";
                return false;
              }),
              { maxLength: 5 },
            ),
          })
          .map(({ nodeTypes, edges, variables }) => {
            const nodes: FlowNode[] = ids.map((id, index) => ({
              id,
              type: nodeTypes[index] ?? "scene",
              title: `Title ${id}`,
            }));
            return {
              id: "proj_rnd_u2",
              name: "Random U2 Project",
              nodes,
              edges,
              variables,
            } satisfies Project;
          });
      });

    it("Property U2: check() never throws on arbitrary projects and enforces XOR of nodeId/variableId", () => {
      fc.assert(
        fc.property(arbitraryProjectWithVariables, (project) => {
          const issues = check(project);
          const existingNodeIds = new Set(project.nodes.map((n) => n.id));
          const existingVarIds = new Set(project.variables.map((v) => v.id));
          const existingEdgeIds = new Set(project.edges.map((e) => e.id));

          for (const issue of issues) {
            // Refinement XOR check
            expect(
              (issue.nodeId !== undefined) !== (issue.variableId !== undefined),
            ).toBe(true);

            if (issue.nodeId !== undefined) {
              expect(existingNodeIds.has(issue.nodeId)).toBe(true);
            }
            if (issue.variableId !== undefined) {
              expect(existingVarIds.has(issue.variableId)).toBe(true);
            }
            if (issue.location) {
              expect(existingEdgeIds.has(issue.location.edgeId)).toBe(true);
              expect(issue.location.start).toBeGreaterThanOrEqual(0);
              expect(issue.location.end).toBeGreaterThanOrEqual(issue.location.start);
            }
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});

