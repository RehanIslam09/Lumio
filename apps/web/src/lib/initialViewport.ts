import type { Project } from "@repo/schema";
import { STORY_NODE_WIDTH, STORY_NODE_HEIGHT } from "../components/StoryNode.js";

export const READABLE_ZOOM = 0.85;
export const FIT_READABLE_THRESHOLD = 0.6;
export const FIT_MAX_ZOOM = 1;
export const VIEW_PADDING = 48;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2;
export const PAN_DURATION = 400;

export type ViewportMode = "fit" | "start";

export interface InitialViewport {
  x: number;
  y: number;
  zoom: number;
  mode: ViewportMode;
}

export interface InitialViewportInput {
  project: Project;
  positions: ReadonlyMap<string, { x: number; y: number }>;
  canvas: { width: number; height: number };
  minZoom: number;
  maxZoom: number;
}

function clamp(value: number, min: number, max: number): number {
  const safeVal = Number.isFinite(value) ? value : 1;
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : 1;
  if (safeMin > safeMax) return safeMin;
  return Math.min(Math.max(safeVal, safeMin), safeMax);
}

/**
 * Computes deterministic initial camera coordinates and zoom level.
 * - If fitZoom >= 0.6: returns mode 'fit' centering all boxes.
 * - Otherwise: returns mode 'start' placing the first start node's left edge at VIEW_PADDING
 *   and vertically centered in the canvas at READABLE_ZOOM (0.85).
 */
export function computeInitialViewport(input: InitialViewportInput): InitialViewport {
  const { project, positions, canvas, minZoom, maxZoom } = input;
  const width = canvas.width;
  const height = canvas.height;

  // Rule 2: Invalid canvas or non-positive/non-finite dimensions
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return {
      x: 0,
      y: 0,
      zoom: clamp(1, minZoom, maxZoom),
      mode: "fit",
    };
  }

  // Rule 1: Find all nodes that have an entry in positions
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let boxCount = 0;

  for (const node of project.nodes) {
    const pos = positions.get(node.id);
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      continue;
    }
    boxCount++;
    if (pos.x < minX) minX = pos.x;
    if (pos.x + STORY_NODE_WIDTH > maxX) maxX = pos.x + STORY_NODE_WIDTH;
    if (pos.y < minY) minY = pos.y;
    if (pos.y + STORY_NODE_HEIGHT > maxY) maxY = pos.y + STORY_NODE_HEIGHT;
  }

  // Rule 2: No boxes (empty project or no positioned nodes)
  if (boxCount === 0 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
    return {
      x: 0,
      y: 0,
      zoom: clamp(1, minZoom, maxZoom),
      mode: "fit",
    };
  }

  const boundsWidth = maxX - minX;
  const boundsHeight = maxY - minY;
  const availableWidth = width - 2 * VIEW_PADDING;
  const availableHeight = height - 2 * VIEW_PADDING;

  // Rule 3: fitZoom over bounding box
  let fitZoom = 0;
  if (availableWidth > 0 && availableHeight > 0 && boundsWidth > 0 && boundsHeight > 0) {
    fitZoom = Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight);
  }

  // Rule 4: If fitZoom >= FIT_READABLE_THRESHOLD -> mode 'fit'
  if (fitZoom >= FIT_READABLE_THRESHOLD) {
    const zoom = clamp(Math.min(fitZoom, FIT_MAX_ZOOM), minZoom, maxZoom);
    const boxCenterX = minX + boundsWidth / 2;
    const boxCenterY = minY + boundsHeight / 2;
    const x = width / 2 - boxCenterX * zoom;
    const y = height / 2 - boxCenterY * zoom;

    return {
      x,
      y,
      zoom,
      mode: "fit",
    };
  }

  // Rule 5: Otherwise mode 'start'
  // Focus node: first 'start' node in project.nodes with a position; else first node with a position
  const focusNode =
    project.nodes.find((n) => n.type === "start" && positions.has(n.id)) ??
    project.nodes.find((n) => positions.has(n.id));

  if (!focusNode) {
    return {
      x: 0,
      y: 0,
      zoom: clamp(1, minZoom, maxZoom),
      mode: "fit",
    };
  }

  const focusPos = positions.get(focusNode.id);
  if (!focusPos) {
    return {
      x: 0,
      y: 0,
      zoom: clamp(1, minZoom, maxZoom),
      mode: "fit",
    };
  }
  const zoom = clamp(READABLE_ZOOM, minZoom, maxZoom);
  // x places focus node's LEFT edge at VIEW_PADDING on screen: screenLeft = focusPos.x * zoom + x
  const x = VIEW_PADDING - focusPos.x * zoom;
  // y centers the node's box vertically: screenCenterY = (focusPos.y + STORY_NODE_HEIGHT / 2) * zoom + y
  const y = height / 2 - (focusPos.y + STORY_NODE_HEIGHT / 2) * zoom;

  return {
    x,
    y,
    zoom,
    mode: "start",
  };
}

/**
 * Pure predicate verifying whether the initial viewport should be applied:
 * requires measured finite positive canvas dimensions and an unapplied loadCounter.
 */
export function shouldApplyInitialViewport(input: {
  loadCounter: number;
  lastApplied: number;
  width: number;
  height: number;
}): boolean {
  return (
    Number.isFinite(input.width) &&
    input.width > 0 &&
    Number.isFinite(input.height) &&
    input.height > 0 &&
    input.loadCounter !== input.lastApplied
  );
}
