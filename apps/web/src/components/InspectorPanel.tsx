import React from "react";
import type { Project, Issue, FlowNodeType } from "@repo/schema";
import type { Selection } from "../lib/flowModel.js";
import { DraftField } from "./DraftField.js";
import { checkConditionDraft } from "../lib/draftCheck.js";
import { ConnectionsSection } from "./ConnectionsSection.js";
import { EdgeNavButtons } from "./EdgeNavButtons.js";
import { EdgeEffectsSection } from "./EdgeEffectsSection.js";

interface InspectorPanelProps {
  project: Project;
  selection: Selection;
  nodeIssues: Issue[];
  edgeIssues: Issue[];
  onUpdateNode: (id: string, patch: { title?: string; type?: FlowNodeType; position?: { x: number; y: number } | null }) => void;
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
  if (!selection) {
    return (
      <div className="inspector-panel empty-selection">
        <p className="empty-state">No element selected.</p>
        <p className="empty-substate">Click a node or edge on the canvas to inspect and edit its properties.</p>
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

          <DraftField
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
            <label htmlFor="inspect-node-type" className="field-label">Type</label>
            <select
              id="inspect-node-type"
              className="field-select"
              value={node.type}
              onChange={(e) => onUpdateNode(node.id, { type: e.target.value as FlowNodeType })}
            >
              <option value="scene">scene</option>
              <option value="start">start</option>
              <option value="end">end</option>
            </select>
          </div>

          <div className="field-group">
            <label className="field-label">Position</label>
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

          <ConnectionsSection
            key={node.id}
            project={project}
            nodeId={node.id}
            onSelectEdge={onSelectEdge}
            onConnect={(toId) => onConnectNodes(node.id, toId)}
          />

          <div className="inspector-danger-zone">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => onDeleteNode(node.id)}
            >
              Delete node
            </button>
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
                {n.title} ({n.id})
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
                {n.title} ({n.id})
              </option>
            ))}
          </select>
        </div>

        <DraftField
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

        <div className="inspector-danger-zone">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onDeleteEdge(edge.id)}
          >
            Delete edge
          </button>
        </div>
      </div>
    </div>
  );
};
