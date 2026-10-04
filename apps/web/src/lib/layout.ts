import type { Project } from "@repo/schema";

export const HORIZONTAL_GAP = 380;
export const VERTICAL_GAP = 140;

/**
 * Computes deterministic 2D coordinates for all nodes in a story project.
 * - Nodes with an explicit `position` keep it exactly.
 * - Other reachable nodes are arranged in horizontal layers:
 *   layer = shortest path length following edge direction from the nearest 'start' node.
 *   x = layer * HORIZONTAL_GAP; y = (index within layer among generated nodes, in project.nodes order) * VERTICAL_GAP.
 * - Unreachable nodes without an explicit position go in an orphan grid BELOW the main flow:
 *   mainLayerCount = startNodeIds.length === 0 ? 0 : maxReachableLayer + 1
 *   columns = Math.max(3, mainLayerCount)
 *   bandTop = maxAutoInMainLayer === 0 ? 0 : maxAutoInMainLayer * VERTICAL_GAP + VERTICAL_GAP
 *   orphan i: column = i % columns, row = floor(i / columns)
 *   x = column * HORIZONTAL_GAP; y = bandTop + row * VERTICAL_GAP
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

  // Determine main layer count
  let maxReachableLayer = -1;
  for (const layer of layerMap.values()) {
    if (layer > maxReachableLayer) {
      maxReachableLayer = layer;
    }
  }

  const mainLayerCount = startNodeIds.length === 0 ? 0 : maxReachableLayer + 1;
  const columns = Math.max(3, mainLayerCount);

  // Group nodes without explicit position into reachable layers or orphan list
  const reachableNodesByLayer = new Map<number, string[]>();
  const orphanNodeIds: string[] = [];

  for (const node of project.nodes) {
    if (node.position) {
      result.set(node.id, { x: node.position.x, y: node.position.y });
    } else if (layerMap.has(node.id)) {
      const layer = layerMap.get(node.id) ?? 0;
      const list = reachableNodesByLayer.get(layer);
      if (list) {
        list.push(node.id);
      } else {
        reachableNodesByLayer.set(layer, [node.id]);
      }
    } else {
      orphanNodeIds.push(node.id);
    }
  }

  // Determine bandTop: max number of auto-placed nodes in any main layer * VERTICAL_GAP + VERTICAL_GAP
  let maxAutoInMainLayer = 0;
  for (const list of reachableNodesByLayer.values()) {
    if (list.length > maxAutoInMainLayer) {
      maxAutoInMainLayer = list.length;
    }
  }

  const bandTop = maxAutoInMainLayer === 0 ? 0 : maxAutoInMainLayer * VERTICAL_GAP + VERTICAL_GAP;

  // Assign coordinates for reachable auto-placed nodes
  for (const [layer, nodeIds] of reachableNodesByLayer.entries()) {
    for (let indexInLayer = 0; indexInLayer < nodeIds.length; indexInLayer++) {
      const nodeId = nodeIds[indexInLayer];
      if (nodeId) {
        result.set(nodeId, {
          x: layer * HORIZONTAL_GAP,
          y: indexInLayer * VERTICAL_GAP,
        });
      }
    }
  }

  // Assign coordinates for unreachable auto-placed nodes in orphan grid below main flow
  for (let i = 0; i < orphanNodeIds.length; i++) {
    const nodeId = orphanNodeIds[i];
    if (nodeId) {
      const column = i % columns;
      const row = Math.floor(i / columns);
      result.set(nodeId, {
        x: column * HORIZONTAL_GAP,
        y: bandTop + row * VERTICAL_GAP,
      });
    }
  }

  return result;
}
