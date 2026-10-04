import React from "react";
import type { Project } from "@repo/schema";

interface EdgeNavButtonsProps {
  project: Project;
  fromNodeId: string;
  toNodeId: string;
  onSelectNode: (nodeId: string) => void;
}

export const EdgeNavButtons: React.FC<EdgeNavButtonsProps> = ({
  project,
  fromNodeId,
  toNodeId,
  onSelectNode,
}) => {
  const sourceNode = project.nodes.find((n) => n.id === fromNodeId);
  const targetNode = project.nodes.find((n) => n.id === toNodeId);

  return (
    <div className="edge-nav-buttons" role="group" aria-label="Edge navigation">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={!sourceNode}
        onClick={() => {
          if (sourceNode) {
            onSelectNode(sourceNode.id);
          }
        }}
        title={
          sourceNode
            ? `Go to source node: ${sourceNode.title} (${sourceNode.id})`
            : "Source node does not exist (dangling edge)"
        }
      >
        Go to source
      </button>

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={!targetNode}
        onClick={() => {
          if (targetNode) {
            onSelectNode(targetNode.id);
          }
        }}
        title={
          targetNode
            ? `Go to target node: ${targetNode.title} (${targetNode.id})`
            : "Target node does not exist (dangling edge)"
        }
      >
        Go to target
      </button>
    </div>
  );
};
