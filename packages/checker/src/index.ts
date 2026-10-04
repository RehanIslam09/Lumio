import type { Issue, Project } from "@repo/schema";
import {
  buildTypeEnv,
  parseCondition,
  parseEffect,
  typecheckCondition,
  typecheckEffect,
} from "@repo/dsl";

type TraversalDirection = "forward" | "reverse";

/**
 * Internal helper to find nodes that cannot be reached (or cannot reach)
 * a seed set of nodes ('start' or 'end'), traversing edges in forward or reverse.
 */
function findUnconnectedNodes(
  project: Project,
  seedType: "start" | "end",
  direction: TraversalDirection,
): string[] {
  const existingNodeIds = new Set<string>();
  const seedNodeIds: string[] = [];

  for (const node of project.nodes) {
    existingNodeIds.add(node.id);
    if (node.type === seedType) {
      seedNodeIds.push(node.id);
    }
  }

  // If there are no seed nodes of the given type, all node IDs are returned.
  if (seedNodeIds.length === 0) {
    return project.nodes.map((node) => node.id);
  }

  // Build adjacency list, ignoring edges referencing nonexistent nodes.
  const adjacency = new Map<string, string[]>();
  for (const edge of project.edges) {
    if (existingNodeIds.has(edge.from) && existingNodeIds.has(edge.to)) {
      const source = direction === "forward" ? edge.from : edge.to;
      const target = direction === "forward" ? edge.to : edge.from;
      const neighbors = adjacency.get(source);
      if (neighbors) {
        neighbors.push(target);
      } else {
        adjacency.set(source, [target]);
      }
    }
  }

  // Traverse the graph via BFS starting from all seed nodes.
  const visited = new Set<string>(seedNodeIds);
  const queue: string[] = [...seedNodeIds];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const neighbors = adjacency.get(current);
    if (!neighbors) {
      continue;
    }

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  // Return unvisited nodes in project.nodes order, excluding seedType nodes.
  const result: string[] = [];
  for (const node of project.nodes) {
    if (node.type !== seedType && !visited.has(node.id)) {
      result.push(node.id);
    }
  }

  return result;
}

/**
 * Finds all nodes in the project that cannot be reached from any 'start' node.
 *
 * Rules:
 * - Edges referencing nonexistent nodes are ignored.
 * - Result contains unreachable node IDs in the same order as project.nodes.
 * - Result contains no duplicates.
 * - If there are no 'start' nodes, all node IDs are returned.
 * - 'start' nodes are never reported as unreachable.
 */
export function findUnreachableNodes(project: Project): string[] {
  return findUnconnectedNodes(project, "start", "forward");
}

/**
 * Finds all nodes in the project from which no 'end' node is reachable.
 *
 * Rules:
 * - Uses reverse BFS from all end nodes over edges between existing nodes.
 * - End nodes are never reported.
 * - If there are no end nodes, all node IDs are returned.
 * - Result order = project.nodes order, no duplicates.
 * - Edges referencing nonexistent nodes are ignored.
 */
export function findNodesThatCannotReachEnd(project: Project): string[] {
  return findUnconnectedNodes(project, "end", "reverse");
}

/**
 * Consistency checker entry point running static analysis rules over the project flow graph.
 *
 * Ordering:
 * - All existing node-based issues first (grouped by project.nodes order, then rule order).
 * - Edge-based issues ordered by project.edges order.
 * - Within an edge: condition issues first, then effects by index.
 * - Within each field: ordered by start offset.
 */
export function check(project: Project): Issue[] {
  const unreachableSet = new Set(findUnreachableNodes(project));
  const cannotReachEndSet = new Set(findNodesThatCannotReachEnd(project));
  const nodeMap = new Map(project.nodes.map((n) => [n.id, n]));
  const env = buildTypeEnv(project.variables);

  const issues: Issue[] = [];

  // Node-based issues
  for (const node of project.nodes) {
    if (unreachableSet.has(node.id)) {
      issues.push({
        ruleId: "unreachable-from-start",
        severity: "warning",
        nodeId: node.id,
        message: `Node "${node.title}" cannot be reached from any start node.`,
      });
    }

    if (cannotReachEndSet.has(node.id)) {
      issues.push({
        ruleId: "cannot-reach-end",
        severity: "error",
        nodeId: node.id,
        message: `Node "${node.title}" cannot reach any end node.`,
      });
    }
  }

  // Edge-based issues
  for (const edge of project.edges) {
    const fromNode = nodeMap.get(edge.from);
    if (!fromNode) {
      continue;
    }

    // Condition
    if (edge.condition !== undefined && edge.condition.trim() !== "") {
      const parsedCond = parseCondition(edge.condition);
      if (!parsedCond.ok) {
        issues.push({
          ruleId: "invalid-expression",
          severity: "error",
          nodeId: edge.from,
          message: `In "${fromNode.title}": condition syntax error: ${parsedCond.error.message}.`,
          location: {
            edgeId: edge.id,
            field: "condition",
            start: parsedCond.error.start,
            end: parsedCond.error.end,
          },
        });
      } else {
        const typeIssues = typecheckCondition(parsedCond.value, env);
        for (const typeIssue of typeIssues) {
          const detail =
            typeIssue.code === "undefined-variable"
              ? typeIssue.message.toLowerCase()
              : typeIssue.message;
          issues.push({
            ruleId: typeIssue.code,
            severity: "error",
            nodeId: edge.from,
            message: `In "${fromNode.title}": ${detail}.`,
            location: {
              edgeId: edge.id,
              field: "condition",
              start: typeIssue.start,
              end: typeIssue.end,
            },
          });
        }
      }
    }

    // Effects
    if (edge.effects) {
      for (let i = 0; i < edge.effects.length; i++) {
        const effectStr = edge.effects[i];
        if (effectStr === undefined || effectStr.trim() === "") {
          continue;
        }

        const parsedEffect = parseEffect(effectStr);
        if (!parsedEffect.ok) {
          issues.push({
            ruleId: "invalid-expression",
            severity: "error",
            nodeId: edge.from,
            message: `In "${fromNode.title}": effect syntax error: ${parsedEffect.error.message}.`,
            location: {
              edgeId: edge.id,
              field: "effect",
              effectIndex: i,
              start: parsedEffect.error.start,
              end: parsedEffect.error.end,
            },
          });
        } else {
          const typeIssues = typecheckEffect(parsedEffect.value, env);
          for (const typeIssue of typeIssues) {
            const detail =
              typeIssue.code === "undefined-variable"
                ? typeIssue.message.toLowerCase()
                : typeIssue.message;
            issues.push({
              ruleId: typeIssue.code,
              severity: "error",
              nodeId: edge.from,
              message: `In "${fromNode.title}": ${detail}.`,
              location: {
                edgeId: edge.id,
                field: "effect",
                effectIndex: i,
                start: typeIssue.start,
                end: typeIssue.end,
              },
            });
          }
        }
      }
    }
  }

  return issues;
}
