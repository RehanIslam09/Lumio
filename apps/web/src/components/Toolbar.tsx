import React, { useState, useRef, useEffect } from "react";
import type { FlowNodeType } from "@repo/schema";
import { Link } from "../router/Link.js";
import { FileActions } from "./FileActions.js";
import { EditableTitle } from "./EditableTitle.js";
import type { AuthState } from "../cloud/state.js";
import type { ProjectBinding } from "../cloud/types.js";

export interface ToolbarProps {
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
  isSaving?: boolean;
  isSaveFailed?: boolean;
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
  onPlaytest?: () => void;
  playtestTriggerRef?: React.RefObject<HTMLButtonElement | null>;
  onSimulate?: () => void;
  simulateTriggerRef?: React.RefObject<HTMLButtonElement | null>;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
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
  isSaving = false,
  isSaveFailed = false,
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
  onPlaytest,
  playtestTriggerRef,
  onSimulate,
  simulateTriggerRef,
  isSidebarCollapsed = false,
  onToggleSidebar,
}) => {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAddMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setIsAddMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsAddMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAddMenuOpen]);

  const handleDashboardClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isDirty) {
      const ok = window.confirm(
        "You have unsaved changes. Return to dashboard without saving?",
      );
      if (!ok) {
        e.preventDefault();
      }
    }
  };

  return (
    <header className="app-header" role="banner">
      {/* Top Application Bar (3-zone layout) */}
      <div className="header-top-row">
        <div className="header-left">
          <Link
            href="/dashboard"
            className="header-back-link"
            title="Return to Dashboard"
            onClick={handleDashboardClick}
          >
            <span className="brand-icon" aria-hidden="true">◆</span>
            <span className="brand-text">← Dashboard</span>
          </Link>
          <span className="header-divider" aria-hidden="true">/</span>
          {binding && (
            <span className="cloud-badge" title={`Bound to cloud project (v${binding.baseVersion})`}>
              Cloud · v{binding.baseVersion}
            </span>
          )}
          {isSaving ? (
            <span className="save-status-badge save-pending" role="status">
              Saving…
            </span>
          ) : isSaveFailed ? (
            <span
              className="save-status-badge save-failed"
              role="alert"
              title="Save to cloud failed. Your local edits are preserved."
            >
              Save failed
            </span>
          ) : isDirty ? (
            <span className="unsaved-badge" title="You have unsaved changes in this session">
              Unsaved changes
            </span>
          ) : binding ? (
            <span
              className="save-status-badge save-success"
              title={`All changes saved to cloud (v${binding.baseVersion})`}
            >
              Saved
            </span>
          ) : null}
        </div>

        <div className="header-center">
          <h1 className="header-title">
            <EditableTitle name={projectName} onRename={onRenameProject} />
          </h1>
        </div>

        <div className="header-right">
          <div className="header-primary-actions">
            <button
              type="button"
              className="btn btn-save-primary"
              onClick={onSaveCloud}
              disabled={isOperationPending || isSaving || (!isDirty && !isSaveFailed && Boolean(binding))}
              title="Save project to cloud (Ctrl+S)"
              aria-label="Save to cloud"
            >
              <span aria-hidden="true">☁</span>
              <span>Save</span>
            </button>

            <div className="button-group" role="group" aria-label="Run story">
              <button
                ref={playtestTriggerRef}
                type="button"
                className="btn btn-secondary"
                onClick={onPlaytest}
                disabled={isOperationPending}
                title="Open story playtest mode"
              >
                Playtest ▶
              </button>
              <button
                ref={simulateTriggerRef}
                type="button"
                className="btn btn-secondary"
                onClick={onSimulate}
                disabled={isOperationPending}
                title="Run story simulation and coverage report"
              >
                Simulate ⚙
              </button>
            </div>
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

          {onToggleSidebar && (
            <button
              type="button"
              className="sidebar-collapse-toggle"
              onClick={onToggleSidebar}
              title={isSidebarCollapsed ? "Show sidebar (Ctrl+\\)" : "Collapse sidebar (Ctrl+\\)"}
              aria-label={isSidebarCollapsed ? "Show sidebar" : "Collapse sidebar"}
            >
              {isSidebarCollapsed ? "◫ Show" : "◫ Hide"}
            </button>
          )}
        </div>
      </div>

      {/* Sub-toolbar Row */}
      <div className="header-subtoolbar" role="toolbar" aria-label="Editor actions">
        <div className="subtoolbar-left">
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
            onReset={onReset}
          />

          <div className="button-group add-node-group" role="group" aria-label="Add story nodes" ref={addMenuRef}>
            <button
              type="button"
              className="btn btn-secondary btn-add-main"
              onClick={() => onAddNode("scene")}
              title="Add a new scene node"
            >
              + Scene
            </button>
            <div className="dropdown-menu-wrapper">
              <button
                type="button"
                className="btn btn-secondary btn-add-caret"
                onClick={() => setIsAddMenuOpen((prev) => !prev)}
                aria-label="Choose node type to add"
                aria-expanded={isAddMenuOpen}
                title="Add other node types"
              >
                ▾
              </button>
              {isAddMenuOpen && (
                <div className="dropdown-menu" role="menu">
                  <button
                    type="button"
                    className="dropdown-menu-item"
                    onClick={() => {
                      onAddNode("scene");
                      setIsAddMenuOpen(false);
                    }}
                  >
                    <span>+ Scene Node</span>
                    <span className="chip-scene" style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3 }}>SCENE</span>
                  </button>
                  <button
                    type="button"
                    className="dropdown-menu-item"
                    onClick={() => {
                      onAddNode("start");
                      setIsAddMenuOpen(false);
                    }}
                  >
                    <span>+ Start Node</span>
                    <span className="chip-start" style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3 }}>START</span>
                  </button>
                  <button
                    type="button"
                    className="dropdown-menu-item"
                    onClick={() => {
                      onAddNode("end");
                      setIsAddMenuOpen(false);
                    }}
                  >
                    <span>+ End Node</span>
                    <span className="chip-end" style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3 }}>END</span>
                  </button>
                </div>
              )}
            </div>
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
        </div>

        <div className="subtoolbar-right">
          <div className="stats-pill" title="Project entity counts">
            <span>{nodesCount} nodes</span>
            <span className="stats-dot">•</span>
            <span>{edgesCount} edges</span>
            <span className="stats-dot">•</span>
            <span>{varsCount} vars</span>
          </div>
        </div>
      </div>
    </header>
  );
};
