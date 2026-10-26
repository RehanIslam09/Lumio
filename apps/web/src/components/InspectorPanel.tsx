import React, { useState } from "react";
import type { Project, Issue, FlowNodeType } from "@repo/schema";
import type { Selection } from "../lib/flowModel.js";
import { DraftField } from "./DraftField.js";
import { MarkdownBodyField } from "./MarkdownBodyField.js";
import { checkConditionDraft } from "../lib/draftCheck.js";
import { ConnectionsSection } from "./ConnectionsSection.js";
import { EdgeNavButtons } from "./EdgeNavButtons.js";
import { EdgeEffectsSection } from "./EdgeEffectsSection.js";
import { speakerOptions } from "../lib/entities.js";

interface InspectorPanelProps {
  project: Project;
  selection: Selection;
  nodeIssues: Issue[];
  edgeIssues: Issue[];
  onUpdateNode: (
    id: string,
    patch: {
      title?: string;
      type?: FlowNodeType;
      position?: { x: number; y: number } | null;
      body?: string | null;
      speakerId?: string | null;
    },
  ) => void;
  onDeleteNode: (id: string) => void;
  onUpdateEdge: (id: string, patch: { from?: string; to?: string; condition?: string | null; effects?: string[] | null }) => void;
  onDeleteEdge: (id: string) => void;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onConnectNodes: (fromId: string, toId: string) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  project,
  selection,
  nodeIssues,
  edgeIssues,
  onUpdateNode,
  onDeleteNode,
  onUpdateEdge,
  onDeleteEdge,
  onSelectNode,
  onSelectEdge,
  onConnectNodes,
}) => {
  const [confirmDeleteNodeId, setConfirmDeleteNodeId] = useState<string | null>(null);
  const [confirmDeleteEdgeId, setConfirmDeleteEdgeId] = useState<string | null>(null);

  if (!selection) {
    return (
      <div className="inspector-panel empty-selection">
        <div className="empty-state-card">
          <p className="empty-state">No element selected</p>
          <p className="empty-substate">Click a story node or connection on the canvas to inspect and edit its properties.</p>
        </div>
      </div>
    );
  }

  if (selection.kind === "node") {
    const node = project.nodes.find((n) => n.id === selection.id);
    if (!node) {
      return (
        <div className="inspector-panel empty-selection">
          <p className="empty-state">Selected node no longer exists.</p>
        </div>
      );
    }

    const speakerOpts = speakerOptions(project);

    return (
      <div className="inspector-panel" aria-label={`Node Inspector: ${node.title}`}>
        {nodeIssues.length > 0 && (
          <div className="inspector-issues" role="region" aria-label="Node issues">
            <h3 className="section-title text-error">Consistency Issues ({nodeIssues.length})</h3>
            {nodeIssues.map((issue, idx) => (
              <div key={idx} className={`issue-card severity-${issue.severity}`}>
                <div className="issue-card-top">
                  <span className={`rule-tag tag-${issue.severity}`}>{issue.ruleId}</span>
                </div>
                <p className="issue-message">{issue.message}</p>
              </div>
            ))}
          </div>
        )}

        <div className="inspector-fields">
          {/* 1. Title and Type */}
          <DraftField
            key={`node-title-${node.id}`}
            id="inspect-node-title"
            label="Title"
            value={node.title}
            onCommit={(nextTitle) => {
              if (nextTitle.trim() !== "") {
                onUpdateNode(node.id, { title: nextTitle.trim() });
              }
            }}
          />

          <div className="field-group">
            <label htmlFor="inspect-node-type" className="field-label">Node Type</label>
            <select
              id="inspect-node-type"
              className="field-select"
              value={node.type}
              onChange={(e) => onUpdateNode(node.id, { type: e.target.value as FlowNodeType })}
            >
              <option value="scene">Scene (Narrative Beat)</option>
              <option value="start">Start (Entry Point)</option>
              <option value="end">End (Resolution Point)</option>
            </select>
          </div>

          {/* 2. Speaker */}
          <div className="field-group">
            <label htmlFor="inspect-node-speaker" className="field-label">Speaker</label>
            <select
              id="inspect-node-speaker"
              className="field-select"
              value={node.speakerId ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                onUpdateNode(node.id, { speakerId: val === "" ? null : val });
              }}
            >
              <option value="">(None / Narrator)</option>
              {speakerOpts.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Markdown Body */}
          <MarkdownBodyField
            key={`node-body-${node.id}`}
            id="inspect-node-body"
            nodeId={node.id}
            label="Body (Markdown)"
            value={node.body ?? ""}
            rows={5}
            placeholder="Scene body text or dialogue... (Markdown supported)"
            onCommit={(nextBody) => {
              const trimmed = nextBody.trim();
              onUpdateNode(node.id, { body: trimmed === "" ? null : nextBody });
            }}
          />

          {/* 4. Connections */}
          <ConnectionsSection
            key={node.id}
            project={project}
            nodeId={node.id}
            onSelectEdge={onSelectEdge}
            onConnect={(toId) => onConnectNodes(node.id, toId)}
          />

          {/* 5. Advanced Details */}
          <details className="inspector-advanced-details">
            <summary className="advanced-summary">Advanced Details</summary>
            <div className="advanced-fields">
              <div className="field-group">
                <label htmlFor="inspect-node-id" className="field-label">Node ID</label>
                <input
                  id="inspect-node-id"
                  type="text"
                  className="field-input field-readonly"
                  value={node.id}
                  readOnly
                  disabled
                />
              </div>

              <div className="field-group">
                <label className="field-label">Canvas Position</label>
                <div className="position-row">
                  <span className="position-coords">
                    {node.position
                      ? `x: ${Math.round(node.position.x)}, y: ${Math.round(node.position.y)}`
                      : "auto (auto layout)"}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!node.position}
                    onClick={() => onUpdateNode(node.id, { position: null })}
                    title="Clear explicit coordinates to use automatic layered layout"
                  >
                    Clear position
                  </button>
                </div>
              </div>
            </div>
          </details>

          {/* Destructive Action with Confirmation Safeguard */}
          <div className="inspector-danger-zone">
            {confirmDeleteNodeId === node.id ? (
              <div className="delete-confirm-box" role="alert">
                <span className="delete-confirm-msg">Delete "{node.title}"?</span>
                <div className="delete-confirm-actions">
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      setConfirmDeleteNodeId(null);
                      onDeleteNode(node.id);
                    }}
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setConfirmDeleteNodeId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-danger-outline"
                onClick={() => setConfirmDeleteNodeId(node.id)}
              >
                Delete node
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Edge selection
  const edge = project.edges.find((e) => e.id === selection.id);
  if (!edge) {
    return (
      <div className="inspector-panel empty-selection">
        <p className="empty-state">Selected edge no longer exists.</p>
      </div>
    );
  }

  return (
    <div className="inspector-panel" aria-label={`Edge Inspector: ${edge.id}`}>
      {edgeIssues.length > 0 && (
        <div className="inspector-issues" role="region" aria-label="Edge issues">
          <h3 className="section-title text-error">Consistency Issues ({edgeIssues.length})</h3>
          {edgeIssues.map((issue, idx) => (
            <div key={idx} className={`issue-card severity-${issue.severity}`}>
              <div className="issue-card-top">
                <span className={`rule-tag tag-${issue.severity}`}>{issue.ruleId}</span>
              </div>
              <p className="issue-message">{issue.message}</p>
            </div>
          ))}
        </div>
      )}

      <div className="inspector-fields">
        <EdgeNavButtons
          project={project}
          fromNodeId={edge.from}
          toNodeId={edge.to}
          onSelectNode={onSelectNode}
        />

        <div className="field-group">
          <label htmlFor="inspect-edge-from" className="field-label">Source Node (From)</label>
          <select
            id="inspect-edge-from"
            className="field-select"
            value={edge.from}
            onChange={(e) => onUpdateEdge(edge.id, { from: e.target.value })}
          >
            {project.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title} [{n.type.toUpperCase()}]
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="inspect-edge-to" className="field-label">Target Node (To)</label>
          <select
            id="inspect-edge-to"
            className="field-select"
            value={edge.to}
            onChange={(e) => onUpdateEdge(edge.id, { to: e.target.value })}
          >
            {project.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title} [{n.type.toUpperCase()}]
              </option>
            ))}
          </select>
        </div>

        <DraftField
          key={`edge-condition-${edge.id}`}
          id="inspect-edge-condition"
          label="Condition (DSL expression)"
          multiline
          rows={2}
          value={edge.condition ?? ""}
          placeholder="e.g. gold >= 10 && has_key"
          checkDraft={(draft) => checkConditionDraft(draft, project.variables)}
          onCommit={(nextCond) => {
            const trimmed = nextCond.trim();
            onUpdateEdge(edge.id, { condition: trimmed === "" ? null : trimmed });
          }}
        />

        <EdgeEffectsSection
          effects={edge.effects ?? []}
          variables={project.variables}
          onUpdateEffects={(effects) => onUpdateEdge(edge.id, { effects })}
        />

        <details className="inspector-advanced-details">
          <summary className="advanced-summary">Advanced Details</summary>
          <div className="advanced-fields">
            <div className="field-group">
              <label htmlFor="inspect-edge-id" className="field-label">Edge ID</label>
              <input
                id="inspect-edge-id"
                type="text"
                className="field-input field-readonly"
                value={edge.id}
                readOnly
                disabled
              />
            </div>
          </div>
        </details>

        <div className="inspector-danger-zone">
          {confirmDeleteEdgeId === edge.id ? (
            <div className="delete-confirm-box" role="alert">
              <span className="delete-confirm-msg">Delete this connection?</span>
              <div className="delete-confirm-actions">
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    setConfirmDeleteEdgeId(null);
                    onDeleteEdge(edge.id);
                  }}
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setConfirmDeleteEdgeId(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-danger-outline"
              onClick={() => setConfirmDeleteEdgeId(edge.id)}
            >
              Delete edge
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
