import { useState, useEffect, useRef, useCallback } from "react";
import { useStore, useReactFlow } from "@xyflow/react";
import type { Project } from "@repo/schema";
import {
  computeInitialViewport,
  shouldApplyInitialViewport,
  MIN_ZOOM,
  MAX_ZOOM,
  PAN_DURATION,
} from "../lib/initialViewport.js";

export interface UseInitialViewportParams {
  project: Project;
  positions: ReadonlyMap<string, { x: number; y: number }>;
  loadCounter: number;
}

export interface UseInitialViewportResult {
  isReady: boolean;
  goToStart: () => void;
}

/**
 * Custom hook to manage the initial viewport camera:
 * - Listens to width and height measured by @xyflow/react.
 * - Applies computeInitialViewport exactly once per loadCounter with duration 0.
 * - Hides the canvas (isReady = false) until applied (with 1000ms safety net).
 * - Exposes goToStart to re-focus start node with 400ms animation.
 */
export function useInitialViewport({
  project,
  positions,
  loadCounter,
}: UseInitialViewportParams): UseInitialViewportResult {
  const { setViewport } = useReactFlow();

  // Clarification 1: Canvas measurement with two separate primitive selectors
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);

  const [isReady, setIsReady] = useState(false);
  const lastAppliedRef = useRef(0);

  // Clarification 4: Latest-value pattern for project and positions
  const latestRef = useRef({ project, positions });
  useEffect(() => {
    latestRef.current = { project, positions };
  });

  // Clarification 3: Safety net timer (1000ms) to ensure canvas is revealed even if unmeasured
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Clarification 4: Camera effect depends on loadCounter and measured width/height
  useEffect(() => {
    if (
      shouldApplyInitialViewport({
        loadCounter,
        lastApplied: lastAppliedRef.current,
        width,
        height,
      })
    ) {
      lastAppliedRef.current = loadCounter;
      const { project: currentProject, positions: currentPositions } = latestRef.current;
      const vp = computeInitialViewport({
        project: currentProject,
        positions: currentPositions,
        canvas: { width, height },
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
      });
      void setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom }, { duration: 0 });
      setIsReady(true);
    }
  }, [loadCounter, width, height, setViewport]);

  // "Go to start" button action with animated pan
  const goToStart = useCallback(() => {
    const { project: currentProject, positions: currentPositions } = latestRef.current;
    const vp = computeInitialViewport({
      project: currentProject,
      positions: currentPositions,
      canvas: { width, height },
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    });
    void setViewport({ x: vp.x, y: vp.y, zoom: vp.zoom }, { duration: PAN_DURATION });
  }, [width, height, setViewport]);

  return { isReady, goToStart };
}
