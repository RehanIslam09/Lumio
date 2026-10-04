import type { Project } from "@repo/schema";

export interface ConnectionRow {
  edgeId: string;
  otherNodeId: string;
  otherTitle: string | undefined;
  condition: string | undefined;
  effectCount: number;
}

export interface NodeConnections {
  outgoing: ConnectionRow[];
  incoming: ConnectionRow[];
}

export interface ConnectTarget {
  id: string;
  label: string;
}

/**
 * Summarizes an edge condition for compact list displays.
 * Undefined or blank returns "always"; otherwise trimmed and truncated
 * with a single ellipsis "…" so the total length never exceeds maxLength.
 */
export function summarizeCondition(condition: string | undefined, maxLength: number): string {
  if (condition === undefined || condition.trim() === "") {
    return "always";
  }

  const trimmed = condition.trim();
  if (maxLength <= 0) {
    return "";
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  if (maxLength === 1) {
    return "…";
  }

  return trimmed.slice(0, maxLength - 1) + "…";
}

/**
 * Lists all incoming and outgoing connections for a specific node in project.edges order.
 * - Self-loops appear in both lists.
 * - Parallel edges each get their own row.
 * - Missing/dangling other nodes yield otherTitle = undefined (never throws).
 */
export function listConnections(project: Project, nodeId: string): NodeConnections {
  const nodeTitleMap = new Map<string, string>();
  for (const n of project.nodes) {
    nodeTitleMap.set(n.id, n.title);
  }

  const outgoing: ConnectionRow[] = [];
  const incoming: ConnectionRow[] = [];

  for (const edge of project.edges) {
    if (edge.from === nodeId) {
      outgoing.push({
        edgeId: edge.id,
        otherNodeId: edge.to,
        otherTitle: nodeTitleMap.get(edge.to),
        condition: edge.condition,
        effectCount: edge.effects ? edge.effects.length : 0,
      });
    }

    if (edge.to === nodeId) {
      incoming.push({
        edgeId: edge.id,
        otherNodeId: edge.from,
        otherTitle: nodeTitleMap.get(edge.from),
        condition: edge.condition,
        effectCount: edge.effects ? edge.effects.length : 0,
      });
    }
  }

  return { outgoing, incoming };
}

/**
 * Returns available connect targets in project.nodes order, formatted as `${title} (${id})`.
 * Includes the node itself so self-loops can be formed.
 */
export function connectTargets(project: Project, nodeId?: string): ConnectTarget[] {
  // nodeId provided in signature; self-loops are allowed, so all project.nodes are valid targets
  if (nodeId !== undefined) {
    // Verified: all nodes including nodeId are permitted
  }
  return project.nodes.map((node) => ({
    id: node.id,
    label: `${node.title} (${node.id})`,
  }));
}
