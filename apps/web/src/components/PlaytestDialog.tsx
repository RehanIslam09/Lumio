import React, { useEffect, useRef, useState, useMemo } from "react";
import { getEntities, type Project } from "@repo/schema";
import {
  startSession,
  listChoices,
  choose,
  back,
  restart,
  type Session,
  type Choice,
} from "../playtest/session.js";

export interface PlaytestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

const MAX_VARIABLES_ROWS = 200;
const MAX_TRAIL_ITEMS = 50;

interface PlaytestDialogContentProps {
  project: Project;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onClose: () => void;
}

const PlaytestDialogContent: React.FC<PlaytestDialogContentProps> = ({
  project,
  selectedNodeId,
  onSelectNode,
  onClose,
}) => {
  const canStartFromSelected = useMemo(() => {
    return Boolean(
      selectedNodeId && project.nodes.some((n) => n.id === selectedNodeId),
    );
  }, [selectedNodeId, project.nodes]);

  const [startFromSelected, setStartFromSelected] = useState<boolean>(false);

  // Initialize fresh session directly upon mounting
  const [session, setSession] = useState<Session | null>(() => {
    const res = startSession(project);
    return res.ok ? res.session : null;
  });

  const handleToggleStartFromSelected = (checked: boolean) => {
    setStartFromSelected(checked);
    const startNodeId = checked && selectedNodeId ? selectedNodeId : undefined;
    const res = startSession(project, { startNodeId });
    setSession(res.ok ? res.session : null);
  };

  // Compute choices at most once per session step identity
  const choices: readonly Choice[] = useMemo(() => {
    if (!session) return [];
    return listChoices(session);
  }, [session]);

  // Current node lookup
  const currentNode = useMemo(() => {
    if (!session) return undefined;
    return session.project.nodes.find((n) => n.id === session.nodeId);
  }, [session]);

  // Speaker entity name lookup via getEntities
  const speakerName = useMemo(() => {
    if (!currentNode?.speakerId) return "Narrator";
    const entities = getEntities(project);
    const found = entities.find((e) => e.id === currentNode.speakerId);
    return found ? found.name : "Narrator";
  }, [currentNode, project]);

  // Visited trail (full node path)
  const fullVisitedPath = useMemo(() => {
    if (!session) return [];
    const path: string[] = session.history.map((s) => s.nodeId);
    path.push(session.nodeId);
    return path;
  }, [session]);

  // Last step for changed variable comparison
  const lastStep = useMemo(() => {
    if (!session || session.history.length === 0) return undefined;
    return session.history[session.history.length - 1];
  }, [session]);

  const handleChoose = (edgeId: string) => {
    if (!session) return;
    const res = choose(session, edgeId);
    if (res.ok) {
      setSession(res.session);
    }
  };

  const handleBack = () => {
    if (!session) return;
    setSession(back(session));
  };

  const handleRestart = () => {
    if (!session) return;
    setSession(restart(session));
  };

  const handleShowOnCanvas = () => {
    if (!session) return;
    onSelectNode(session.nodeId);
  };

  return (
    <div className="playtest-dialog-content">
      <header className="playtest-dialog-header">
        <div className="playtest-header-info">
          <h2 id="playtest-dialog-title" className="playtest-title">
            Playtest Mode
          </h2>
          <label className="playtest-start-toggle">
            <input
              type="checkbox"
              checked={startFromSelected}
              disabled={!canStartFromSelected}
              onChange={(e) => handleToggleStartFromSelected(e.target.checked)}
            />
            <span>Start from selected node</span>
          </label>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClose}
          aria-label="Close playtest"
        >
          ✕
        </button>
      </header>

      {!session ? (
        <div className="playtest-dialog-body">
          <div className="playtest-banner playtest-banner-error" role="alert">
            This project has no start node. Add a Start node to playtest.
          </div>
          <div className="playtest-dialog-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <div className="playtest-dialog-body">
          {/* Status alerts */}
          {session.status === "ended" && (
            <div className="playtest-banner playtest-banner-success" role="status">
              Story completed (End node reached).
            </div>
          )}
          {session.status === "stuck" && (
            <div className="playtest-banner playtest-banner-warning" role="status">
              {session.message ?? "Story stuck: no further choices available."}
            </div>
          )}
          {session.status === "error" && (
            <div className="playtest-banner playtest-banner-error" role="alert">
              {session.message ?? "An error occurred during playtest."}
            </div>
          )}

          <div className="playtest-main-grid">
            {/* Left Column: Story & Choices */}
            <div className="playtest-story-pane">
              <div className="playtest-node-header">
                <div className="playtest-node-meta">
                  <span className={`chip chip-${currentNode?.type ?? "scene"}`}>
                    {currentNode?.type ?? "scene"}
                  </span>
                  <h3 className="playtest-node-title">
                    {currentNode?.title ?? session.nodeId}
                  </h3>
                </div>
                <div className="playtest-speaker-badge">
                  Speaker: <span className="speaker-name">{speakerName}</span>
                </div>
              </div>

              <div className="playtest-node-body">
                {currentNode?.body && currentNode.body.length > 0 ? (
                  <div className="playtest-body-text">{currentNode.body}</div>
                ) : (
                  <div className="playtest-empty-body">(No dialogue or description)</div>
                )}
              </div>

              <div className="playtest-choices-section">
                <h4 className="playtest-section-heading">Choices</h4>
                {choices.length === 0 ? (
                  <div className="playtest-empty-choices">No outgoing choices</div>
                ) : (
                  <div className="playtest-choices-list" role="group" aria-label="Available choices">
                    {choices.map((c) => {
                      const isAvailable = c.status === "available";
                      return (
                        <button
                          key={c.edgeId}
                          type="button"
                          className={`playtest-choice-btn playtest-choice-${c.status}`}
                          disabled={!isAvailable}
                          onClick={() => handleChoose(c.edgeId)}
                        >
                          <div className="choice-btn-main">
                            <span className="choice-target-title">
                              {c.targetTitle ?? c.targetNodeId}
                            </span>
                            {c.conditionText && (
                              <span className="choice-condition-text">
                                [{c.conditionText}]
                              </span>
                            )}
                          </div>
                          {!isAvailable && c.reason && (
                            <div className="choice-reason-text">
                              {c.reason}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Variables & Visited Trail */}
            <div className="playtest-inspect-pane">
              <div className="playtest-variables-section">
                <h4 className="playtest-section-heading">Variables</h4>
                <div className="playtest-variables-table-wrap">
                  <table className="playtest-variables-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.variables.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="empty-cell">
                            No variables defined
                          </td>
                        </tr>
                      ) : (
                        <>
                          {project.variables.slice(0, MAX_VARIABLES_ROWS).map((v) => {
                            const currentVal = session.state.get(v.name);
                            const prevVal = lastStep?.state.get(v.name);
                            const isChanged =
                              lastStep !== undefined && currentVal !== prevVal;

                            return (
                              <tr
                                key={v.id}
                                className={isChanged ? "row-changed" : ""}
                              >
                                <td className="var-name">
                                  {v.name}
                                  {isChanged && <span className="changed-dot" title="Changed" />}
                                </td>
                                <td className="var-type">{v.type}</td>
                                <td className="var-val">
                                  {currentVal === undefined
                                    ? "—"
                                    : typeof currentVal === "boolean"
                                      ? currentVal ? "true" : "false"
                                      : String(currentVal)}
                                </td>
                              </tr>
                            );
                          })}
                          {project.variables.length > MAX_VARIABLES_ROWS && (
                            <tr className="more-row">
                              <td colSpan={3}>
                                and {project.variables.length - MAX_VARIABLES_ROWS} more variables
                              </td>
                            </tr>
                          )}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="playtest-trail-section">
                <h4 className="playtest-section-heading">Visited Trail</h4>
                <div className="playtest-trail-list">
                  {fullVisitedPath.length > MAX_TRAIL_ITEMS && (
                    <div className="trail-item trail-more">
                      and {fullVisitedPath.length - MAX_TRAIL_ITEMS} earlier
                    </div>
                  )}
                  {fullVisitedPath.slice(-MAX_TRAIL_ITEMS).map((nid, idx) => {
                    const n = project.nodes.find((item) => item.id === nid);
                    const isCurrent = idx === Math.min(fullVisitedPath.length, MAX_TRAIL_ITEMS) - 1;
                    return (
                      <div
                        key={`${nid}-${idx}`}
                        className={`trail-item ${isCurrent ? "trail-item-current" : ""}`}
                      >
                        <span className="trail-node-title">{n?.title ?? nid}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <footer className="playtest-dialog-footer">
            <div className="footer-left-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={session.history.length === 0}
                onClick={handleBack}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRestart}
              >
                Restart
              </button>
              <div className="canvas-select-group">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleShowOnCanvas}
                >
                  Show on canvas
                </button>
                <span className="canvas-note">
                  Close this dialog to see the selection.
                </span>
              </div>
            </div>

            <div className="footer-right-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
};

export const PlaytestDialog: React.FC<PlaytestDialogProps> = ({
  isOpen,
  onClose,
  project,
  selectedNodeId,
  onSelectNode,
  triggerRef,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Synchronize native modal display
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleClose = () => {
    onClose();
    triggerRef?.current?.focus();
  };

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    handleClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="playtest-dialog"
      onCancel={handleCancel}
      aria-labelledby="playtest-dialog-title"
    >
      {isOpen && (
        <PlaytestDialogContent
          project={project}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onClose={handleClose}
        />
      )}
    </dialog>
  );
};
