import type { Project, FlowNode } from "@repo/schema";
import { computeLayout } from "../../lib/layout.js";

export interface ThumbnailOptions {
  width?: number; // default 320
  height?: number; // default 180
  padding?: number; // default 14
  maxNodes?: number; // default 250
  maxEdges?: number; // default 500
}

export interface ThumbnailStats {
  nodeCount: number;
  edgeCount: number;
  startCount: number;
  endCount: number;
  sampled: boolean;
  shownNodes: number;
  shownEdges: number;
}

export interface ThumbnailNode {
  id: string;
  x: number;
  y: number;
  kind: "start" | "scene" | "end";
  weight: number;
}

export interface ThumbnailEdge {
  from: string;
  to: string;
  weight: number;
}

export interface StoryThumbnailData {
  width: number;
  height: number;
  nodes: readonly ThumbnailNode[];
  edges: readonly ThumbnailEdge[];
  stats: ThumbnailStats;
}

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 180;
const DEFAULT_PADDING = 14;
const DEFAULT_MAX_NODES = 250;
const DEFAULT_MAX_EDGES = 500;

const CELL_LADDER = [
  8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536,
  2048, 3072, 4096, 6144, 8192, 12288, 16384, 24576, 32768, 65536, 131072,
  262144, 524288,
];

function isFiniteCoordinate(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val);
}

function compareNodesForCellRepresentative(
  a: FlowNode,
  b: FlowNode,
  degreeMap: ReadonlyMap<string, number>,
): number {
  // 1. start node if any
  const aIsStart = a.type === "start";
  const bIsStart = b.type === "start";
  if (aIsStart !== bIsStart) {
    return aIsStart ? -1 : 1;
  }

  // 2. else an end node
  const aIsEnd = a.type === "end";
  const bIsEnd = b.type === "end";
  if (aIsEnd !== bIsEnd) {
    return aIsEnd ? -1 : 1;
  }

  // 3. else highest-degree node
  const degA = degreeMap.get(a.id) ?? 0;
  const degB = degreeMap.get(b.id) ?? 0;
  if (degA !== degB) {
    return degB - degA; // higher degree first
  }

  // 4. ties by smallest id (lexicographic)
  return a.id.localeCompare(b.id, "en");
}

export function buildStoryThumbnail(
  project: Project,
  options?: ThumbnailOptions,
): StoryThumbnailData {
  const width = options?.width ?? DEFAULT_WIDTH;
  const height = options?.height ?? DEFAULT_HEIGHT;
  const padding = options?.padding ?? DEFAULT_PADDING;
  const maxNodes = options?.maxNodes ?? DEFAULT_MAX_NODES;
  const maxEdges = options?.maxEdges ?? DEFAULT_MAX_EDGES;

  const nodeCount = project.nodes.length;
  const edgeCount = project.edges.length;

  let startCount = 0;
  let endCount = 0;
  for (const node of project.nodes) {
    if (node.type === "start") startCount++;
    else if (node.type === "end") endCount++;
  }

  if (nodeCount === 0) {
    return {
      width,
      height,
      nodes: [],
      edges: [],
      stats: {
        nodeCount: 0,
        edgeCount,
        startCount: 0,
        endCount: 0,
        sampled: false,
        shownNodes: 0,
        shownEdges: 0,
      },
    };
  }

  // Resolve node positions: use node.position if both coordinates are finite, else computeLayout
  const hasIncompletePositions = project.nodes.some(
    (n) => !n.position || !isFiniteCoordinate(n.position.x) || !isFiniteCoordinate(n.position.y),
  );
  const layoutPositions = hasIncompletePositions ? computeLayout(project) : null;

  interface RawNodeCoord {
    node: FlowNode;
    x: number;
    y: number;
  }

  const rawCoords: RawNodeCoord[] = project.nodes.map((n) => {
    if (n.position && isFiniteCoordinate(n.position.x) && isFiniteCoordinate(n.position.y)) {
      return { node: n, x: n.position.x, y: n.position.y };
    }
    const computed = layoutPositions?.get(n.id) ?? { x: 0, y: 0 };
    return { node: n, x: computed.x, y: computed.y };
  });

  const nodeMap = new Map<string, FlowNode>(project.nodes.map((n) => [n.id, n]));
  const coordMap = new Map<string, { x: number; y: number }>(
    rawCoords.map((rc) => [rc.node.id, { x: rc.x, y: rc.y }]),
  );

  // Compute node degrees in original graph (for valid existing nodes)
  const degreeMap = new Map<string, number>();
  for (const edge of project.edges) {
    if (nodeMap.has(edge.from) && nodeMap.has(edge.to)) {
      degreeMap.set(edge.from, (degreeMap.get(edge.from) ?? 0) + 1);
      degreeMap.set(edge.to, (degreeMap.get(edge.to) ?? 0) + 1);
    }
  }

  let keptNodes: { id: string; origX: number; origY: number; kind: "start" | "scene" | "end"; weight: number }[] = [];
  let nodeToRepMap = new Map<string, string>();
  const sampled = nodeCount > maxNodes;

  if (!sampled) {
    // Under maxNodes: keep all nodes exactly
    keptNodes = rawCoords.map((rc) => ({
      id: rc.node.id,
      origX: rc.x,
      origY: rc.y,
      kind: rc.node.type,
      weight: 1,
    }));
    nodeToRepMap = new Map(project.nodes.map((n) => [n.id, n.id]));
  } else {
    // Spatial coarsening: find smallest cell size from ladder
    let chosenCellSize = CELL_LADDER[CELL_LADDER.length - 1] ?? 524288;
    for (const cellSize of CELL_LADDER) {
      const occupied = new Set<string>();
      for (const rc of rawCoords) {
        const cellKey = `${Math.floor(rc.x / cellSize)},${Math.floor(rc.y / cellSize)}`;
        occupied.add(cellKey);
      }
      if (occupied.size <= maxNodes) {
        chosenCellSize = cellSize;
        break;
      }
    }

    // Group nodes by cell
    const cellGroups = new Map<string, FlowNode[]>();
    for (const rc of rawCoords) {
      const cellKey = `${Math.floor(rc.x / chosenCellSize)},${Math.floor(rc.y / chosenCellSize)}`;
      const list = cellGroups.get(cellKey);
      if (list) {
        list.push(rc.node);
      } else {
        cellGroups.set(cellKey, [rc.node]);
      }
    }

    // Pick representative per cell: start > end > highest degree > smallest id
    for (const [, cellNodes] of cellGroups) {
      cellNodes.sort((a, b) => compareNodesForCellRepresentative(a, b, degreeMap));
      const rep = cellNodes[0];
      if (!rep) continue;
      const pos = coordMap.get(rep.id) ?? { x: 0, y: 0 };
      keptNodes.push({
        id: rep.id,
        origX: pos.x,
        origY: pos.y,
        kind: rep.type,
        weight: cellNodes.length,
      });
      for (const member of cellNodes) {
        nodeToRepMap.set(member.id, rep.id);
      }
    }
  }

  // Edge mapping
  // Edges whose endpoints are missing in project.nodes are skipped when drawing
  const edgePairWeights = new Map<string, { from: string; to: string; weight: number }>();
  for (const edge of project.edges) {
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) {
      continue;
    }
    const repFrom = nodeToRepMap.get(edge.from);
    const repTo = nodeToRepMap.get(edge.to);
    if (!repFrom || !repTo || repFrom === repTo) {
      continue; // drop self-pairs
    }
    const key = `${repFrom}->${repTo}`;
    const existing = edgePairWeights.get(key);
    if (existing) {
      existing.weight++;
    } else {
      edgePairWeights.set(key, { from: repFrom, to: repTo, weight: 1 });
    }
  }

  const allAggregatedEdges = Array.from(edgePairWeights.values());
  // Sort edges by weight desc, then from asc, then to asc
  allAggregatedEdges.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (a.from !== b.from) return a.from.localeCompare(b.from, "en");
    return a.to.localeCompare(b.to, "en");
  });

  const keptEdges = allAggregatedEdges.slice(0, maxEdges);

  // Normalization to padded frame
  const drawWidth = width - 2 * padding;
  const drawHeight = height - 2 * padding;
  const centerX = width / 2;
  const centerY = height / 2;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const kn of keptNodes) {
    if (kn.origX < minX) minX = kn.origX;
    if (kn.origX > maxX) maxX = kn.origX;
    if (kn.origY < minY) minY = kn.origY;
    if (kn.origY > maxY) maxY = kn.origY;
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;

  const normalizedNodes: ThumbnailNode[] = keptNodes.map((kn) => {
    if (keptNodes.length === 1 || (spanX === 0 && spanY === 0)) {
      return {
        id: kn.id,
        x: centerX,
        y: centerY,
        kind: kn.kind,
        weight: kn.weight,
      };
    }

    if (spanX === 0) {
      // Degenerate collinear vertically
      const s = drawHeight / spanY;
      return {
        id: kn.id,
        x: centerX,
        y: padding + (kn.origY - minY) * s,
        kind: kn.kind,
        weight: kn.weight,
      };
    }

    if (spanY === 0) {
      // Degenerate collinear horizontally
      const s = drawWidth / spanX;
      return {
        id: kn.id,
        x: padding + (kn.origX - minX) * s,
        y: centerY,
        kind: kn.kind,
        weight: kn.weight,
      };
    }

    // General 2D case: base uniform scale ensures content fits within drawWidth x drawHeight
    const baseScale = Math.min(drawWidth / spanX, drawHeight / spanY);
    const scaleX = baseScale;

    // When content aspect ratio is much wider than the frame (drawWidth / spanX < drawHeight / spanY),
    // allow vertical stretch capped at 2.2x to better fill the frame vertically while preserving
    // topological monotonic ordering and keeping coordinates bounded within [padding, height - padding].
    const maxScaleY = baseScale * 2.2;
    const targetScaleY = drawHeight / spanY;
    const scaleY = Math.min(targetScaleY, maxScaleY);

    const scaledW = spanX * scaleX;
    const scaledH = spanY * scaleY;
    const offsetX = padding + (drawWidth - scaledW) / 2;
    const offsetY = padding + (drawHeight - scaledH) / 2;

    return {
      id: kn.id,
      x: offsetX + (kn.origX - minX) * scaleX,
      y: offsetY + (kn.origY - minY) * scaleY,
      kind: kn.kind,
      weight: kn.weight,
    };
  });

  return {
    width,
    height,
    nodes: normalizedNodes,
    edges: keptEdges,
    stats: {
      nodeCount,
      edgeCount,
      startCount,
      endCount,
      sampled,
      shownNodes: normalizedNodes.length,
      shownEdges: keptEdges.length,
    },
  };
}

export function formatThumbnailStats(stats: ThumbnailStats): {
  summary: string;
  overviewLabel?: string;
  overviewTooltip?: string;
} {
  const nodeText = `${stats.nodeCount.toLocaleString("en-US")} ${stats.nodeCount === 1 ? "node" : "nodes"}`;
  const edgeText = `${stats.edgeCount.toLocaleString("en-US")} ${stats.edgeCount === 1 ? "edge" : "edges"}`;
  const endingText = `${stats.endCount.toLocaleString("en-US")} ${stats.endCount === 1 ? "ending" : "endings"}`;

  const summary = `${nodeText} · ${edgeText} · ${endingText}`;

  if (!stats.sampled) {
    return { summary };
  }

  const overviewLabel = `Overview of ${stats.nodeCount.toLocaleString("en-US")} nodes`;
  const overviewTooltip = `Showing ${stats.shownNodes.toLocaleString("en-US")} of ${stats.nodeCount.toLocaleString("en-US")} nodes`;

  return { summary, overviewLabel, overviewTooltip };
}
