import React from "react";
import type { FlowNodeType } from "@repo/schema";

interface ToolbarProps {
  projectName: string;
  canUndo: boolean;
  canRedo: boolean;
  nodesCount: number;
  edgesCount: number;
  varsCount: number;
  onAddNode: (type: FlowNodeType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  projectName,
  canUndo,
  canRedo,
  nodesCount,
  edgesCount,
  varsCount,
  onAddNode,
  onUndo,
  onRedo,
  onReset,
}) => {
  return (
    <header className="app-header">
      <div className="header-left">
        <div className="header-badge">Lumio Narrative Studio</div>
        <h1 className="header-title">{projectName}</h1>
        {canUndo && (
          <span className="unsaved-badge" title="You have unsaved changes in this session">
            Unsaved changes
          </span>
        )}
      </div>

      <div className="header-right">
        <div className="toolbar-actions" role="toolbar" aria-label="Editor actions">
          <div className="button-group" role="group" aria-label="Add nodes">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onAddNode("scene")}
              title="Add a new scene node"
            >
              + Scene
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onAddNode("start")}
              title="Add a new start node"
            >
              + Start
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onAddNode("end")}
              title="Add a new end node"
            >
              + End
            </button>
          </div>

          <div className="button-group" role="group" aria-label="History">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo last action (Ctrl+Z)"
              aria-label="Undo last action"
            >
              Undo
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo action (Ctrl+Shift+Z or Ctrl+Y)"
              aria-label="Redo action"
            >
              Redo
            </button>
          </div>

          <button
            type="button"
            className="btn btn-danger-outline"
            onClick={onReset}
            title="Reset project to sample"
          >
            Reset sample
          </button>
        </div>

        <div className="stats-pill" aria-label="Project statistics">
          <span>{nodesCount} nodes</span>
          <span>•</span>
          <span>{edgesCount} edges</span>
          <span>•</span>
          <span>{varsCount} vars</span>
        </div>
      </div>
    </header>
  );
};
