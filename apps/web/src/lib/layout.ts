import type { Project } from "@repo/schema";

/**
 * Computes deterministic 2D coordinates for all nodes in a story project.
 * - Nodes with an explicit `position` keep it exactly.
 * - Other reachable nodes are arranged in horizontal layers:
 *   layer = shortest path length following edge direction from the nearest 'start' node.
 *   x = layer * 280; y = (index within layer among generated nodes, in project.nodes order) * 140.
 * - Unreachable nodes go in a separate orphan band: layer = (maxReachableLayer + 2).
 *   If there are no start nodes, all nodes are placed in the orphan band at layer 0.
 */
export function computeLayout(project: Project): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  const existingNodeIds = new Set(project.nodes.map((n) => n.id));

  // Build adjacency list for edges referencing valid nodes
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

  // BFS from all 'start' nodes to compute shortest path layer (following edge direction)
  const startNodeIds = project.nodes
    .filter((n) => n.type === "start")
    .map((n) => n.id);

  const layerMap = new Map<string, number>();
  const queue: string[] = [];

  for (const startId of startNodeIds) {
    layerMap.set(startId, 0);
    queue.push(startId);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const currentLayer = layerMap.get(current) ?? 0;
    const nextLayer = currentLayer + 1;

    const neighbors = adjacency.get(current);
    if (neighbors) {
      for (const neighbor of neighbors) {
        const existingLayer = layerMap.get(neighbor);
        if (existingLayer === undefined || nextLayer < existingLayer) {
          layerMap.set(neighbor, nextLayer);
          queue.push(neighbor);
        }
      }
    }
  }

  // Determine orphan layer
  let maxReachableLayer = -1;
  for (const layer of layerMap.values()) {
    if (layer > maxReachableLayer) {
      maxReachableLayer = layer;
    }
  }

  const orphanLayer = startNodeIds.length === 0 ? 0 : maxReachableLayer + 2;

  // Group nodes without explicit position by their assigned layer, in project.nodes order
  const nodesByLayer = new Map<number, string[]>();

  for (const node of project.nodes) {
    if (node.position) {
      result.set(node.id, { x: node.position.x, y: node.position.y });
    } else {
      const layer = layerMap.has(node.id) ? (layerMap.get(node.id) ?? 0) : orphanLayer;
      const list = nodesByLayer.get(layer);
      if (list) {
        list.push(node.id);
      } else {
        nodesByLayer.set(layer, [node.id]);
      }
    }
  }

  // Assign coordinates for generated positions
  for (const [layer, nodeIds] of nodesByLayer.entries()) {
    for (let indexInLayer = 0; indexInLayer < nodeIds.length; indexInLayer++) {
      const nodeId = nodeIds[indexInLayer];
      if (nodeId) {
        result.set(nodeId, {
          x: layer * 280,
          y: indexInLayer * 140,
        });
      }
    }
  }

  return result;
}
