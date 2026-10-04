import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import type { Project, FlowNode, FlowEdge } from "@repo/schema";
import {
  listConnections,
  connectTargets,
  summarizeCondition,
  type ConnectionRow,
} from "./connections.js";

describe("summarizeCondition", () => {
  it("returns 'always' for undefined, empty, or whitespace-only condition", () => {
    expect(summarizeCondition(undefined, 40)).toBe("always");
    expect(summarizeCondition("", 40)).toBe("always");
    expect(summarizeCondition("   ", 40)).toBe("always");
    expect(summarizeCondition("\t\n", 40)).toBe("always");
  });

  it("returns trimmed condition if length <= maxLength", () => {
    expect(summarizeCondition("  gold >= 10  ", 40)).toBe("gold >= 10");
    // Exact length match
    const exact = "a".repeat(10);
    expect(summarizeCondition(exact, 10)).toBe(exact);
    expect(summarizeCondition(`  ${exact}  `, 10)).toBe(exact);
  });

  it("truncates with a single ellipsis when longer than maxLength without exceeding maxLength", () => {
    // 11 chars with maxLength 10 -> 9 chars + 1 ellipsis = 10 chars
    const eleven = "abcdefghijk";
    const res = summarizeCondition(eleven, 10);
    expect(res).toBe("abcdefghi…");
    expect(res.length).toBe(10);
  });

  it("handles maxLength 1 edge case", () => {
    const res = summarizeCondition("hello", 1);
    expect(res).toBe("…");
    expect(res.length).toBe(1);
  });

  it("handles maxLength 0 edge case", () => {
    const res = summarizeCondition("hello", 0);
    expect(res).toBe("");
    expect(res.length).toBe(0);
  });
});

describe("connectTargets", () => {
  it("returns nodes in project.nodes order with `${title} (${id})` including self", () => {
    const project: Project = {
      id: "proj_1",
      name: "Test",
      nodes: [
        { id: "node_1", title: "Intro", type: "start" },
        { id: "node_2", title: "Market", type: "scene" },
        { id: "node_3", title: "Castle", type: "end" },
      ],
      edges: [],
      variables: [],
    };

    const targets = connectTargets(project, "node_2");
    expect(targets).toEqual([
      { id: "node_1", label: "Intro (node_1)" },
      { id: "node_2", label: "Market (node_2)" },
      { id: "node_3", label: "Castle (node_3)" },
    ]);
  });

  it("returns empty array when project has no nodes", () => {
    const project: Project = {
      id: "proj_1",
      name: "Empty",
      nodes: [],
      edges: [],
      variables: [],
    };
    expect(connectTargets(project, "node_1")).toEqual([]);
  });
});

describe("listConnections", () => {
  it("returns empty outgoing and incoming for node with no edges", () => {
    const project: Project = {
      id: "proj_1",
      name: "Test",
      nodes: [{ id: "n1", title: "Node 1", type: "scene" }],
      edges: [],
      variables: [],
    };
    const res = listConnections(project, "n1");
    expect(res.outgoing).toEqual([]);
    expect(res.incoming).toEqual([]);
  });

  it("preserves project.edges order in outgoing and incoming lists", () => {
    const project: Project = {
      id: "proj_1",
      name: "Order Test",
      nodes: [
        { id: "center", title: "Center", type: "scene" },
        { id: "n1", title: "N1", type: "scene" },
        { id: "n2", title: "N2", type: "scene" },
        { id: "n3", title: "N3", type: "scene" },
      ],
      edges: [
        { id: "e1", from: "center", to: "n3" },
        { id: "e2", from: "n1", to: "center" },
        { id: "e3", from: "center", to: "n1" },
        { id: "e4", from: "n2", to: "center" },
        { id: "e5", from: "center", to: "n2" },
      ],
      variables: [],
    };

    const res = listConnections(project, "center");
    expect(res.outgoing.map((r) => r.edgeId)).toEqual(["e1", "e3", "e5"]);
    expect(res.incoming.map((r) => r.edgeId)).toEqual(["e2", "e4"]);
  });

  it("includes a self-loop in BOTH outgoing and incoming lists", () => {
    const project: Project = {
      id: "proj_1",
      name: "Self Loop",
      nodes: [{ id: "n1", title: "Self", type: "scene" }],
      edges: [
        {
          id: "e_loop",
          from: "n1",
          to: "n1",
          condition: "gold > 0",
          effects: ["gold -= 1"],
        },
      ],
      variables: [],
    };

    const res = listConnections(project, "n1");
    expect(res.outgoing).toHaveLength(1);
    expect(res.incoming).toHaveLength(1);

    const expectedRow: ConnectionRow = {
      edgeId: "e_loop",
      otherNodeId: "n1",
      otherTitle: "Self",
      condition: "gold > 0",
      effectCount: 1,
    };
    expect(res.outgoing[0]).toEqual(expectedRow);
    expect(res.incoming[0]).toEqual(expectedRow);
  });

  it("gives parallel edges each their own row", () => {
    const project: Project = {
      id: "proj_1",
      name: "Parallel",
      nodes: [
        { id: "n1", title: "Start", type: "start" },
        { id: "n2", title: "End", type: "end" },
      ],
      edges: [
        { id: "e_a", from: "n1", to: "n2", condition: "choice == 1" },
        { id: "e_b", from: "n1", to: "n2", condition: "choice == 2" },
      ],
      variables: [],
    };

    const res = listConnections(project, "n1");
    expect(res.outgoing).toHaveLength(2);
    expect(res.outgoing[0]?.edgeId).toBe("e_a");
    expect(res.outgoing[0]?.otherTitle).toBe("End");
    expect(res.outgoing[1]?.edgeId).toBe("e_b");
    expect(res.outgoing[1]?.otherTitle).toBe("End");
  });

  it("sets otherTitle to undefined for dangling other node without throwing", () => {
    const project: Project = {
      id: "proj_1",
      name: "Dangling",
      nodes: [{ id: "n1", title: "Solo", type: "scene" }],
      edges: [
        { id: "e_out", from: "n1", to: "non_existent_target" },
        { id: "e_in", from: "non_existent_source", to: "n1" },
      ],
      variables: [],
    };

    const res = listConnections(project, "n1");
    expect(res.outgoing).toHaveLength(1);
    expect(res.outgoing[0]).toEqual({
      edgeId: "e_out",
      otherNodeId: "non_existent_target",
      otherTitle: undefined,
      condition: undefined,
      effectCount: 0,
    });

    expect(res.incoming).toHaveLength(1);
    expect(res.incoming[0]).toEqual({
      edgeId: "e_in",
      otherNodeId: "non_existent_source",
      otherTitle: undefined,
      condition: undefined,
      effectCount: 0,
    });
  });

  it("property test: every edge incident to nodeId appears in exactly the right list(s) and nowhere else", () => {
    const nodeArb: fc.Arbitrary<FlowNode> = fc.record({
      id: fc.stringMatching(/^node_[a-z0-9]{1,4}$/),
      title: fc.string(),
      type: fc.constantFrom("start" as const, "scene" as const, "end" as const),
    });

    const edgeArb = (nodeIds: string[]): fc.Arbitrary<FlowEdge> =>
      fc.record({
        id: fc.stringMatching(/^edge_[a-z0-9]{1,4}$/),
        from: fc.constantFrom(...nodeIds, "dangling_from"),
        to: fc.constantFrom(...nodeIds, "dangling_to"),
        condition: fc.option(fc.string(), { nil: undefined }),
        effects: fc.option(fc.array(fc.string()), { nil: undefined }),
      });

    fc.assert(
      fc.property(
        fc.uniqueArray(nodeArb, { selector: (n) => n.id, minLength: 1, maxLength: 6 }).chain((nodes) => {
          const ids = nodes.map((n) => n.id);
          return fc.tuple(
            fc.constant(nodes),
            fc.uniqueArray(edgeArb(ids), { selector: (e) => e.id, maxLength: 12 }),
            fc.constantFrom(...ids),
          );
        }),
        ([nodes, edges, targetId]) => {
          const project: Project = {
            id: "proj_1",
            name: "PropTest",
            nodes,
            edges,
            variables: [],
          };

          const { outgoing, incoming } = listConnections(project, targetId);

          // Check outgoing
          const expectedOutgoing = edges.filter((e) => e.from === targetId);
          expect(outgoing.map((r) => r.edgeId)).toEqual(expectedOutgoing.map((e) => e.id));
          for (let i = 0; i < outgoing.length; i++) {
            const row = outgoing[i];
            const edge = expectedOutgoing[i];
            if (!row || !edge) {
              throw new Error(`Expected outgoing row and edge at index ${i}`);
            }
            expect(row.otherNodeId).toBe(edge.to);
            const expectedNode = nodes.find((n) => n.id === edge.to);
            expect(row.otherTitle).toBe(expectedNode?.title);
            expect(row.condition).toBe(edge.condition);
            expect(row.effectCount).toBe(edge.effects ? edge.effects.length : 0);
          }

          // Check incoming
          const expectedIncoming = edges.filter((e) => e.to === targetId);
          expect(incoming.map((r) => r.edgeId)).toEqual(expectedIncoming.map((e) => e.id));
          for (let i = 0; i < incoming.length; i++) {
            const row = incoming[i];
            const edge = expectedIncoming[i];
            if (!row || !edge) {
              throw new Error(`Expected incoming row and edge at index ${i}`);
            }
            expect(row.otherNodeId).toBe(edge.from);
            const expectedNode = nodes.find((n) => n.id === edge.from);
            expect(row.otherTitle).toBe(expectedNode?.title);
            expect(row.condition).toBe(edge.condition);
            expect(row.effectCount).toBe(edge.effects ? edge.effects.length : 0);
          }

          // Self loop check: if from === targetId && to === targetId, it must be in both
          for (const edge of edges) {
            const isSelf = edge.from === targetId && edge.to === targetId;
            const inOut = outgoing.some((r) => r.edgeId === edge.id);
            const inInc = incoming.some((r) => r.edgeId === edge.id);
            if (isSelf) {
              expect(inOut).toBe(true);
              expect(inInc).toBe(true);
            } else if (edge.from === targetId) {
              expect(inOut).toBe(true);
              expect(inInc).toBe(false);
            } else if (edge.to === targetId) {
              expect(inOut).toBe(false);
              expect(inInc).toBe(true);
            } else {
              expect(inOut).toBe(false);
              expect(inInc).toBe(false);
            }
          }
        },
      ),
    );
  });
});
