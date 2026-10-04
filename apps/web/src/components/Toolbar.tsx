import React from "react";
import type { FlowNodeType } from "@repo/schema";
import { FileActions } from "./FileActions.js";
import { EditableTitle } from "./EditableTitle.js";

interface ToolbarProps {
  projectName: string;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  nodesCount: number;
  edgesCount: number;
  varsCount: number;
  onRenameProject: (name: string) => void;
  onNew: () => void;
  onOpen: (file: File) => void;
  onSave: () => void;
  onAddNode: (type: FlowNodeType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  projectName,
  isDirty,
  canUndo,
  canRedo,
  nodesCount,
  edgesCount,
  varsCount,
  onRenameProject,
  onNew,
  onOpen,
  onSave,
  onAddNode,
  onUndo,
  onRedo,
  onReset,
}) => {
  return (
    <header className="app-header">
      <div className="header-left">
        <div className="header-badge">Lumio Narrative Studio</div>
        <h1 className="header-title">
          <EditableTitle name={projectName} onRename={onRenameProject} />
        </h1>
        {isDirty && (
          <span className="unsaved-badge" title="You have unsaved changes in this session">
            Unsaved changes
          </span>
        )}
      </div>

      <div className="header-right">
        <div className="toolbar-actions" role="toolbar" aria-label="Editor actions">
          <FileActions onNew={onNew} onOpen={onOpen} onSave={onSave} />

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

        <div className="stats-pill" title="Project entity counts">
          <span>{nodesCount} nodes</span>
          <span className="stats-dot">•</span>
          <span>{edgesCount} edges</span>
          <span className="stats-dot">•</span>
          <span>{varsCount} vars</span>
        </div>
      </div>
    </header>
  );
};
