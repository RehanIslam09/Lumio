import { describe, it, expect } from "vitest";
import { FlowNodeSchema, FlowEdgeSchema, VariableSchema } from "@repo/schema";
import { makeNode, makeEdge, makeVariable } from "./defaults";

describe("defaults", () => {
  describe("makeNode", () => {
    it("generates unique ids following nextId and valid schema", () => {
      const existing = ["node_1", "node_2"];
      const sceneNode = makeNode("scene", existing, { x: 50, y: 100 });
      expect(sceneNode.id).toBe("node_3");
      expect(sceneNode.type).toBe("scene");
      expect(sceneNode.title).toBe("New scene");
      expect(sceneNode.position).toEqual({ x: 50, y: 100 });
      expect(FlowNodeSchema.safeParse(sceneNode).success).toBe(true);

      const startNode = makeNode("start", existing);
      expect(startNode.id).toBe("node_3");
      expect(startNode.type).toBe("start");
      expect(startNode.title).toBe("New start");
      expect(startNode.position).toBeUndefined();
      expect(FlowNodeSchema.safeParse(startNode).success).toBe(true);

      const endNode = makeNode("end", existing);
      expect(endNode.title).toBe("New end");
      expect(FlowNodeSchema.safeParse(endNode).success).toBe(true);
    });

    it("fills id gaps", () => {
      const existing = ["node_1", "node_3"];
      const node = makeNode("scene", existing);
      expect(node.id).toBe("node_2");
    });
  });

  describe("makeEdge", () => {
    it("generates unique ids following nextId and valid schema", () => {
      const existing = ["edge_1", "edge_2"];
      const edge = makeEdge("node_1", "node_2", existing);
      expect(edge.id).toBe("edge_3");
      expect(edge.from).toBe("node_1");
      expect(edge.to).toBe("node_2");
      expect(FlowEdgeSchema.safeParse(edge).success).toBe(true);
    });

    it("fills id gaps", () => {
      const existing = ["edge_2"];
      const edge = makeEdge("node_1", "node_2", existing);
      expect(edge.id).toBe("edge_1");
    });
  });

  describe("makeVariable", () => {
    it("creates variable_N with smallest unused N among existing names, type number, initial 0", () => {
      const existing = [
        { id: "var_1", name: "variable_1", type: "number" as const, initial: 0 },
        { id: "var_2", name: "variable_2", type: "number" as const, initial: 0 },
      ];
      const v = makeVariable(existing);
      expect(v.id).toBe("var_3");
      expect(v.name).toBe("variable_3");
      expect(v.type).toBe("number");
      expect(v.initial).toBe(0);
      expect(VariableSchema.safeParse(v).success).toBe(true);
    });

    it("fills gaps in variable names", () => {
      const existing = [
        { id: "var_1", name: "variable_2", type: "number" as const, initial: 0 },
      ];
      const v = makeVariable(existing);
      expect(v.name).toBe("variable_1");
      expect(v.id).toBe("var_2");
    });
  });
});
