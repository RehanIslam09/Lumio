import React, { useState, useMemo } from "react";
import type { Project } from "@repo/schema";
import {
  listConnections,
  connectTargets,
  summarizeCondition,
  type ConnectionRow,
} from "../lib/connections.js";

interface ConnectionsSectionProps {
  project: Project;
  nodeId: string;
  onSelectEdge: (edgeId: string) => void;
  onConnect: (toNodeId: string) => void;
}

export const ConnectionsSection: React.FC<ConnectionsSectionProps> = ({
  project,
  nodeId,
  onSelectEdge,
  onConnect,
}) => {
  const [chosenTargetId, setChosenTargetId] = useState<string>("");

  const connections = useMemo(() => listConnections(project, nodeId), [project, nodeId]);
  const targets = useMemo(() => connectTargets(project, nodeId), [project, nodeId]);

  // Chosen target must be reset to "nothing chosen" if it no longer exists in present project
  const validTargetIds = useMemo(() => new Set(targets.map((t) => t.id)), [targets]);
  const effectiveTargetId = chosenTargetId && validTargetIds.has(chosenTargetId) ? chosenTargetId : "";

  const handleConnectClick = () => {
    if (!effectiveTargetId) return;
    onConnect(effectiveTargetId);
    setChosenTargetId("");
  };

  const renderConnectionRow = (row: ConnectionRow, direction: "outgoing" | "incoming") => {
    const arrow = direction === "outgoing" ? "→" : "←";
    const dirLabel = direction === "outgoing" ? "Outgoing to" : "Incoming from";
    const otherDisplay = row.otherTitle ?? "(missing node)";
    const conditionSummary = summarizeCondition(row.condition, 40);

    return (
      <button
        key={row.edgeId}
        type="button"
        className="connection-row-btn"
        onClick={() => onSelectEdge(row.edgeId)}
        aria-label={`${dirLabel} ${otherDisplay}`}
      >
        <span className="conn-arrow" aria-hidden="true">{arrow}</span>
        <span className="conn-title">{otherDisplay}</span>
        <span className="conn-condition">{conditionSummary}</span>
        {row.effectCount > 0 && (
          <span className="conn-fx-chip">fx {row.effectCount}</span>
        )}
      </button>
    );
  };

  return (
    <div className="inspector-connections-section">
      <h3 className="section-title">Connections</h3>

      {/* Outgoing connections */}
      <div className="connections-group">
        <span className="connections-subheading">Outgoing ({connections.outgoing.length})</span>
        {connections.outgoing.length === 0 ? (
          <div className="connections-empty-block">
            <p className="connections-empty">None yet.</p>
            <p className="connections-empty-hint">No outgoing connections yet.</p>
          </div>
        ) : (
          <div className="connections-list" role="list">
            {connections.outgoing.map((row) => renderConnectionRow(row, "outgoing"))}
          </div>
        )}
      </div>

      {/* Incoming connections */}
      <div className="connections-group">
        <span className="connections-subheading">Incoming ({connections.incoming.length})</span>
        {connections.incoming.length === 0 ? (
          <div className="connections-empty-block">
            <p className="connections-empty">None yet.</p>
          </div>
        ) : (
          <div className="connections-list" role="list">
            {connections.incoming.map((row) => renderConnectionRow(row, "incoming"))}
          </div>
        )}
      </div>

      {/* Connect to... */}
      <div className="field-group connect-to-group">
        <label htmlFor="connect-target-select" className="field-label">Connect to…</label>
        <div className="connect-to-row">
          <select
            id="connect-target-select"
            className="field-select"
            value={effectiveTargetId}
            onChange={(e) => setChosenTargetId(e.target.value)}
          >
            <option value="">Select a target node…</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!effectiveTargetId}
            onClick={handleConnectClick}
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
};
