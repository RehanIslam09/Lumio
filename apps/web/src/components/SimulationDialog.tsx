import React, { useEffect, useRef, useState, useMemo } from "react";
import type { Project } from "@repo/schema";
import { simulate, type SimulateResult } from "../playtest/simulate.js";
import { crossCheck, type Finding, type FindingKind } from "../playtest/crossCheck.js";

export interface SimulationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onSelectTarget: (selection: { kind: "node" | "edge"; id: string }) => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

interface SimulationDialogContentProps {
  project: Project;
  onSelectTarget: (selection: { kind: "node" | "edge"; id: string }) => void;
  onClose: () => void;
}

const KIND_LABELS: Record<FindingKind, string> = {
  "never-visited-but-reachable": "Never Visited (Topologically Reachable)",
  "unreachable-confirmed": "Unreachable Confirmed (Orphans)",
  "ending-never-reached": "Endings Never Reached",
  "edge-never-available": "Choices Never Available",
  "stuck-spot": "Stuck Spots",
  "loop-suspect": "Suspected Infinite Loops",
};

const SimulationDialogContent: React.FC<SimulationDialogContentProps> = ({
  project,
  onSelectTarget,
  onClose,
}) => {
  const [runsInput, setRunsInput] = useState<number>(500);
  const [maxStepsInput, setMaxStepsInput] = useState<number>(200);
  const [seedInput, setSeedInput] = useState<number>(42);

  // Compute initial simulation directly upon mounting
  const [simResult, setSimResult] = useState<SimulateResult>(() => {
    return simulate(project, { runs: 500, maxSteps: 200, seed: 42 });
  });

  const handleRunSimulation = () => {
    const res = simulate(project, {
      runs: runsInput,
      maxSteps: maxStepsInput,
      seed: seedInput,
    });
    setSimResult(res);
  };

  const findings = useMemo<readonly Finding[]>(() => {
    if (!simResult.ok) return [];
    return crossCheck(project, simResult);
  }, [project, simResult]);

  const groupedFindings = useMemo(() => {
    const map = new Map<FindingKind, Finding[]>();
    for (const f of findings) {
      const list = map.get(f.kind) ?? [];
      list.push(f);
      map.set(f.kind, list);
    }
    return map;
  }, [findings]);

  const endingsList = useMemo(() => {
    if (!simResult.ok) return [];
    const list: Array<{ id: string; title: string; count: number; pct: string }> = [];
    for (const [endNodeId, count] of simResult.endCounts.entries()) {
      const node = project.nodes.find((n) => n.id === endNodeId);
      const title = node?.title ?? endNodeId;
      const pct = ((count / simResult.runs) * 100).toFixed(1);
      list.push({ id: endNodeId, title, count, pct });
    }
    list.sort((a, b) => b.count - a.count);
    return list;
  }, [project.nodes, simResult]);

  return (
    <div className="sim-dialog-shell">
      <header className="sim-dialog-header">
        <h2 id="sim-dialog-title" className="sim-dialog-title">
          Story Simulation & Coverage Report
        </h2>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClose}
          aria-label="Close simulation"
        >
          ✕
        </button>
      </header>

      <div className="sim-dialog-body">
        {/* Controls row */}
        <div className="sim-controls-bar">
          <div className="sim-control-group">
            <label htmlFor="sim-input-runs" className="sim-control-label">
              Runs (1–5000):
            </label>
            <input
              id="sim-input-runs"
              type="number"
              className="input-field sim-control-input"
              value={runsInput}
              min={1}
              max={5000}
              onChange={(e) => setRunsInput(Number(e.target.value))}
            />
          </div>

          <div className="sim-control-group">
            <label htmlFor="sim-input-steps" className="sim-control-label">
              Max Steps (1–2000):
            </label>
            <input
              id="sim-input-steps"
              type="number"
              className="input-field sim-control-input"
              value={maxStepsInput}
              min={1}
              max={2000}
              onChange={(e) => setMaxStepsInput(Number(e.target.value))}
            />
          </div>

          <div className="sim-control-group">
            <label htmlFor="sim-input-seed" className="sim-control-label">
              Seed:
            </label>
            <input
              id="sim-input-seed"
              type="number"
              className="input-field sim-control-input"
              value={seedInput}
              onChange={(e) => setSeedInput(Number(e.target.value))}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary sim-run-btn"
            onClick={handleRunSimulation}
          >
            Run simulation
          </button>
        </div>

        {/* Clamping notes if present */}
        {simResult.ok && simResult.clamped.length > 0 && (
          <div className="sim-clamped-bar">
            {simResult.clamped.map((c) => (
              <span key={c} className="sim-clamped-tag">
                {c}
              </span>
            ))}
          </div>
        )}

        {/* Content results or error */}
        {!simResult.ok ? (
          <div className="sim-error-banner">
            Cannot run simulation: project has no start node.
          </div>
        ) : (
          <div className="sim-results-container">
            {/* Summary statistics */}
            <div className="sim-summary-grid">
              <div className="sim-stat-card">
                <div className="sim-stat-val">{simResult.runs}</div>
                <div className="sim-stat-label">Total Runs</div>
              </div>
              <div className="sim-stat-card">
                <div className="sim-stat-val">{simResult.outcomeCounts.ended}</div>
                <div className="sim-stat-label">Ended</div>
              </div>
              <div className="sim-stat-card">
                <div className="sim-stat-val">{simResult.outcomeCounts.stuck}</div>
                <div className="sim-stat-label">Stuck</div>
              </div>
              <div className="sim-stat-card">
                <div className="sim-stat-val">{simResult.outcomeCounts.stepLimit}</div>
                <div className="sim-stat-label">Step Limit</div>
              </div>
              <div className="sim-stat-card">
                <div className="sim-stat-val">{simResult.neverVisited.length}</div>
                <div className="sim-stat-label">Never Visited</div>
              </div>
              <div className="sim-stat-card">
                <div className="sim-stat-val">{simResult.longestRun}</div>
                <div className="sim-stat-label">Longest Run</div>
              </div>
            </div>

            {/* Endings breakdown */}
            <section className="sim-section">
              <h3 className="sim-section-title">Reached Endings</h3>
              {endingsList.length === 0 ? (
                <div className="sim-empty-note">No endings reached.</div>
              ) : (
                <table className="sim-table">
                  <thead>
                    <tr>
                      <th>Ending Title</th>
                      <th>Reached Runs</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endingsList.map((end) => (
                      <tr key={end.id}>
                        <td className="sim-td-title">{end.title}</td>
                        <td className="sim-td-num">{end.count}</td>
                        <td className="sim-td-pct">{end.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* Cross-check findings */}
            <section className="sim-section">
              <h3 className="sim-section-title">
                Cross-check Findings ({findings.length})
              </h3>
              {findings.length === 0 ? (
                <div className="sim-clean-banner">
                  No structural anomalies or unvisited paths detected!
                </div>
              ) : (
                <div className="sim-findings-grouped">
                  {Array.from(groupedFindings.entries()).map(([kind, items]) => (
                    <div key={kind} className="sim-group-block">
                      <h4 className="sim-group-header">
                        {KIND_LABELS[kind]} ({items.length})
                      </h4>
                      <ul className="sim-finding-list">
                        {items.map((f, idx) => (
                          <li
                            key={`${kind}-${f.nodeId ?? f.edgeId ?? idx}`}
                            className="sim-finding-item"
                          >
                            <span className="sim-finding-msg">{f.message}</span>
                            {(f.nodeId || f.edgeId) && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm sim-canvas-btn"
                                onClick={() => {
                                  if (f.nodeId) {
                                    onSelectTarget({ kind: "node", id: f.nodeId });
                                  } else if (f.edgeId) {
                                    onSelectTarget({ kind: "edge", id: f.edgeId });
                                  }
                                }}
                              >
                                Show on canvas
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Confidence note */}
            <div className="sim-confidence-box">
              <span className="sim-confidence-text">
                {simResult.confidenceNote}
              </span>
            </div>
          </div>
        )}
      </div>

      <footer className="sim-dialog-footer">
        <div className="sim-footer-left">
          <span className="sim-canvas-note">
            Close this dialog to see any canvas selection.
          </span>
        </div>
        <div className="sim-footer-right">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </footer>
    </div>
  );
};

export const SimulationDialog: React.FC<SimulationDialogProps> = ({
  isOpen,
  onClose,
  project,
  onSelectTarget,
  triggerRef,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

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
      className="sim-dialog"
      onCancel={handleCancel}
      aria-labelledby="sim-dialog-title"
    >
      {isOpen && (
        <SimulationDialogContent
          project={project}
          onSelectTarget={onSelectTarget}
          onClose={handleClose}
        />
      )}
    </dialog>
  );
};
