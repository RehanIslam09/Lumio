import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Issue } from "@repo/schema";

export interface StoryNodeData extends Record<string, unknown> {
  title: string;
  nodeType: "start" | "scene" | "end";
  issues: Issue[];
}

export const StoryNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as StoryNodeData;
  const errors = (nodeData.issues ?? []).filter((i) => i.severity === "error");
  const warnings = (nodeData.issues ?? []).filter((i) => i.severity === "warning");

  return (
    <div
      className={`story-node story-node-${nodeData.nodeType} ${selected ? "selected" : ""}`}
      tabIndex={0}
      role="button"
      aria-label={`${nodeData.title} (${nodeData.nodeType})`}
    >
      <Handle type="target" position={Position.Left} className="flow-handle handle-target" />
      <div className="story-node-header">
        <span className={`node-type-chip chip-${nodeData.nodeType}`}>{nodeData.nodeType}</span>
        <div className="node-badges">
          {errors.length > 0 && (
            <span className="badge badge-error" title={`${errors.length} error(s)`}>
              {errors.length} err
            </span>
          )}
          {warnings.length > 0 && (
            <span className="badge badge-warning" title={`${warnings.length} warning(s)`}>
              {warnings.length} warn
            </span>
          )}
        </div>
      </div>
      <div className="story-node-title">{nodeData.title}</div>
      <Handle type="source" position={Position.Right} className="flow-handle handle-source" />
    </div>
  );
});

StoryNode.displayName = "StoryNode";
