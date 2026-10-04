import { describe, it, expect } from "vitest";
import type { Project } from "@repo/schema";
import { projectToFlow } from "./flowModel";

describe("projectToFlow", () => {
  const sampleProject: Project = {
    id: "proj_1",
    name: "Sample Project",
    nodes: [
      { id: "node_1", title: "Start Node", type: "start", position: { x: 10, y: 20 } },
      { id: "node_2", title: "Scene Node", type: "scene" },
      { id: "node_3", title: "End Node", type: "end" },
    ],
    edges: [
      { id: "edge_1", from: "node_1", to: "node_2", condition: "x > 0" },
      { id: "edge_2", from: "node_2", to: "node_3", effects: ["x = 1"] },
      { id: "edge_dangling", from: "node_1", to: "node_missing" },
    ],
    variables: [{ id: "var_1", name: "x", type: "number", initial: 0 }],
  };

  const positions = new Map<string, { x: number; y: number }>([
    ["node_1", { x: 10, y: 20 }],
    ["node_2", { x: 100, y: 150 }],
    ["node_3", { x: 200, y: 300 }],
  ]);

  it("calculates counts and skips dangling edges", () => {
    const { nodes, edges } = projectToFlow(sampleProject, positions, null);
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2); // edge_dangling must be skipped
    expect(edges.find((e) => e.id === "edge_dangling")).toBeUndefined();
  });

  it("uses provided layout positions and dimensions", () => {
    const { nodes } = projectToFlow(sampleProject, positions, null);
    const n2 = nodes.find((n) => n.id === "node_2");
    expect(n2).toBeDefined();
    expect(n2?.position).toEqual({ x: 100, y: 150 });
  });

  it("sets selected flag on node when selected", () => {
    const { nodes, edges } = projectToFlow(sampleProject, positions, {
      kind: "node",
      id: "node_2",
    });
    expect(nodes.find((n) => n.id === "node_2")?.selected).toBe(true);
    expect(nodes.find((n) => n.id === "node_1")?.selected).toBe(false);
    expect(edges.every((e) => !e.selected)).toBe(true);
  });

  it("sets selected flag on edge when selected", () => {
    const { nodes, edges } = projectToFlow(sampleProject, positions, {
      kind: "edge",
      id: "edge_1",
    });
    expect(edges.find((e) => e.id === "edge_1")?.selected).toBe(true);
    expect(edges.find((e) => e.id === "edge_2")?.selected).toBe(false);
    expect(nodes.every((n) => !n.selected)).toBe(true);
  });

  it("is deterministic", () => {
    const run1 = projectToFlow(sampleProject, positions, null);
    const run2 = projectToFlow(sampleProject, positions, null);
    expect(run1).toEqual(run2);
  });
});
