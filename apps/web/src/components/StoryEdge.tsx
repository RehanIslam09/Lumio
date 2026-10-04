import React, { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export interface StoryEdgeData extends Record<string, unknown> {
  condition?: string;
  effects?: string[];
  hasIssue?: boolean;
  onSelect?: (id: string) => void;
}

export const StoryEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
  selected,
}: EdgeProps) => {
  const edgeData = data as unknown as StoryEdgeData | undefined;
  const condition = edgeData?.condition;
  const effectsCount = edgeData?.effects?.length ?? 0;
  const hasIssue = edgeData?.hasIssue ?? false;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const hasLabel = Boolean(condition || effectsCount > 0);

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {hasLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
          >
            <div
              className={`edge-label-container ${hasIssue ? "has-issue" : ""} ${selected ? "selected" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                edgeData?.onSelect?.(id);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  edgeData?.onSelect?.(id);
                }
              }}
            >
              {condition && (
                <span
                  className="edge-condition-pill"
                  title={condition}
                >
                  {condition}
                </span>
              )}
              {effectsCount > 0 && (
                <span
                  className="edge-fx-chip"
                  title={`${effectsCount} effect(s)`}
                >
                  fx {effectsCount}
                </span>
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

StoryEdge.displayName = "StoryEdge";
