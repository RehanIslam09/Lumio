import type { Project } from "@repo/schema";

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
  const existingNodeIds = new Set<string>();
  const startNodeIds: string[] = [];

  for (const node of project.nodes) {
    existingNodeIds.add(node.id);
    if (node.type === "start") {
      startNodeIds.push(node.id);
    }
  }

  // If there are no start nodes, all node IDs are considered unreachable.
  if (startNodeIds.length === 0) {
    return project.nodes.map((node) => node.id);
  }

  // Build adjacency list, ignoring edges referencing nonexistent nodes.
  const adjacency = new Map<string, string[]>();
  for (const edge of project.edges) {
    if (existingNodeIds.has(edge.from) && existingNodeIds.has(edge.to)) {
      const neighbors = adjacency.get(edge.from);
      if (neighbors) {
        neighbors.push(edge.to);
      } else {
        adjacency.set(edge.from, [edge.to]);
      }
    }
  }

  // Traverse the graph via BFS starting from all start nodes.
  const visited = new Set<string>(startNodeIds);
  const queue: string[] = [...startNodeIds];

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

  // Return unreachable nodes in project.nodes order, excluding start nodes.
  const unreachableNodeIds: string[] = [];
  for (const node of project.nodes) {
    if (node.type !== "start" && !visited.has(node.id)) {
      unreachableNodeIds.push(node.id);
    }
  }

  return unreachableNodeIds;
}
