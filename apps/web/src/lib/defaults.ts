import type { FlowNode, FlowEdge, Variable, FlowNodeType } from "@repo/schema";
import { nextId } from "../editor/id.js";

/**
 * Creates a new FlowNode with a unique ID and default title based on type.
 */
export function makeNode(
  type: FlowNodeType,
  existingIds: readonly string[],
  position?: { x: number; y: number },
): FlowNode {
  const id = nextId(existingIds, "node");
  let title = "New scene";
  if (type === "start") {
    title = "New start";
  } else if (type === "end") {
    title = "New end";
  }

  const node: FlowNode = {
    id,
    type,
    title,
  };

  if (position !== undefined) {
    node.position = { x: position.x, y: position.y };
  }

  return node;
}

/**
 * Creates a new FlowEdge with a unique ID between from and to nodes.
 */
export function makeEdge(
  from: string,
  to: string,
  existingIds: readonly string[],
): FlowEdge {
  return {
    id: nextId(existingIds, "edge"),
    from,
    to,
  };
}

/**
 * Creates a new Variable with a unique ID and smallest unused variable_N name.
 */
export function makeVariable(
  existing: readonly { id: string; name: string }[],
): Variable {
  const existingIds = existing.map((v) => v.id);
  const existingNames = new Set(existing.map((v) => v.name));

  let n = 1;
  while (existingNames.has(`variable_${n}`)) {
    n++;
  }

  return {
    id: nextId(existingIds, "var"),
    name: `variable_${n}`,
    type: "number",
    initial: 0,
  };
}
