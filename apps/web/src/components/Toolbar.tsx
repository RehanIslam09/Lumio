import React from "react";
import type { FlowNodeType } from "@repo/schema";
import { FileActions } from "./FileActions.js";
import { EditableTitle } from "./EditableTitle.js";
import type { AuthState } from "../cloud/state.js";
import type { ProjectBinding } from "../cloud/types.js";

interface ToolbarProps {
  projectName: string;
  binding: ProjectBinding | null;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  nodesCount: number;
  edgesCount: number;
  varsCount: number;
  auth: AuthState;
  isOperationPending: boolean;
  onRenameProject: (name: string) => void;
  onNew: () => void;
  onOpen: (file: File) => void;
  onSave: () => void;
  onSaveCloud: () => void;
  onOpenCloud: () => void;
  onOpenHistory?: () => void;
  isHistoryEnabled?: boolean;
  historyTitle?: string;
  onSignIn: () => void;
  onSignOut: () => void;
  onAddNode: (type: FlowNodeType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  projectName,
  binding,
  isDirty,
  canUndo,
  canRedo,
  nodesCount,
  edgesCount,
  varsCount,
  auth,
  isOperationPending,
  onRenameProject,
  onNew,
  onOpen,
  onSave,
  onSaveCloud,
  onOpenCloud,
  onOpenHistory,
  isHistoryEnabled,
  historyTitle,
  onSignIn,
  onSignOut,
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
        {binding && (
          <span className="cloud-badge" title={`Bound to cloud project (v${binding.baseVersion})`}>
            Cloud · v{binding.baseVersion}
          </span>
        )}
        {isDirty && (
          <span className="unsaved-badge" title="You have unsaved changes in this session">
            Unsaved changes
          </span>
        )}
      </div>

      <div className="header-right">
        <div className="toolbar-actions" role="toolbar" aria-label="Editor actions">
          <FileActions
            onNew={onNew}
            onOpen={onOpen}
            onSave={onSave}
            onSaveCloud={onSaveCloud}
            onOpenCloud={onOpenCloud}
            onOpenHistory={onOpenHistory}
            isHistoryEnabled={isHistoryEnabled}
            historyTitle={historyTitle}
            disabled={isOperationPending}
          />

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
            disabled={isOperationPending}
            title="Reset project to sample"
          >
            Reset sample
          </button>
        </div>

        <div className="account-controls">
          {auth.kind === "signedIn" ? (
            <div className="user-profile">
              <span className="user-email" title={auth.user.email}>
                {auth.user.email}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onSignOut}
                disabled={isOperationPending}
                title="Sign out of Lumio"
              >
                Sign out
              </button>
            </div>
          ) : auth.kind === "offline" ? (
            <div className="offline-profile">
              <span className="offline-badge" title="Backend server could not be reached">
                Offline
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onSignIn}
                disabled={isOperationPending}
                title="Try to sign in"
              >
                Sign in
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onSignIn}
              disabled={isOperationPending}
              title="Sign in or create account"
            >
              Sign in
            </button>
          )}
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
