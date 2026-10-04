import React from "react";
import type { Project, Issue, FlowNodeType, Variable, VariableType } from "@repo/schema";
import type { Selection } from "../lib/flowModel.js";
import { IssuesPanel } from "./IssuesPanel.js";
import { InspectorPanel } from "./InspectorPanel.js";
import { VariablesPanel } from "./VariablesPanel.js";

export type PanelTab = "issues" | "inspector" | "variables";

interface RightPanelProps {
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  project: Project;
  issues: Issue[];
  selectedIssue: Issue | null;
  selection: Selection;
  onSelectIssue: (issue: Issue) => void;
  nodeIssues: Issue[];
  edgeIssues: Issue[];
  variableIssues: Map<string, Issue[]>;
  onUpdateNode: (
    id: string,
    patch: { title?: string; type?: FlowNodeType; position?: { x: number; y: number } | null },
  ) => void;
  onDeleteNode: (id: string) => void;
  onUpdateEdge: (
    id: string,
    patch: { from?: string; to?: string; condition?: string | null; effects?: string[] | null },
  ) => void;
  onDeleteEdge: (id: string) => void;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onConnectNodes: (fromId: string, toId: string) => void;
  onAddVariable: () => void;
  onUpdateVariable: (
    id: string,
    patch: { name?: string; type?: VariableType; initial?: Variable["initial"] | null },
  ) => void;
  onDeleteVariable: (id: string) => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  activeTab,
  onTabChange,
  project,
  issues,
  selectedIssue,
  selection,
  onSelectIssue,
  nodeIssues,
  edgeIssues,
  variableIssues,
  onUpdateNode,
  onDeleteNode,
  onUpdateEdge,
  onDeleteEdge,
  onSelectNode,
  onSelectEdge,
  onConnectNodes,
  onAddVariable,
  onUpdateVariable,
  onDeleteVariable,
}) => {
  return (
    <aside className="right-sidebar" aria-label="Editor Sidebar">
      <nav className="sidebar-tabs" role="tablist" aria-label="Sidebar Sections">
        <button
          type="button"
          role="tab"
          id="tab-issues"
          aria-selected={activeTab === "issues"}
          aria-controls="panel-issues"
          className={`tab-btn ${activeTab === "issues" ? "active" : ""}`}
          onClick={() => onTabChange("issues")}
        >
          Issues
          <span className="tab-badge">{issues.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-inspector"
          aria-selected={activeTab === "inspector"}
          aria-controls="panel-inspector"
          className={`tab-btn ${activeTab === "inspector" ? "active" : ""}`}
          onClick={() => onTabChange("inspector")}
        >
          Inspector
          {selection && <span className="tab-indicator" />}
        </button>
        <button
          type="button"
          role="tab"
          id="tab-variables"
          aria-selected={activeTab === "variables"}
          aria-controls="panel-variables"
          className={`tab-btn ${activeTab === "variables" ? "active" : ""}`}
          onClick={() => onTabChange("variables")}
        >
          Variables
          <span className="tab-badge">{project.variables.length}</span>
        </button>
      </nav>

      <div className="tab-content">
        {activeTab === "issues" && (
          <div id="panel-issues" role="tabpanel" aria-labelledby="tab-issues" tabIndex={0}>
            <IssuesPanel
              project={project}
              issues={issues}
              selectedIssue={selectedIssue}
              onSelectIssue={onSelectIssue}
            />
          </div>
        )}

        {activeTab === "inspector" && (
          <div id="panel-inspector" role="tabpanel" aria-labelledby="tab-inspector" tabIndex={0}>
            <InspectorPanel
              project={project}
              selection={selection}
              nodeIssues={nodeIssues}
              edgeIssues={edgeIssues}
              onUpdateNode={onUpdateNode}
              onDeleteNode={onDeleteNode}
              onUpdateEdge={onUpdateEdge}
              onDeleteEdge={onDeleteEdge}
              onSelectNode={onSelectNode}
              onSelectEdge={onSelectEdge}
              onConnectNodes={onConnectNodes}
            />
          </div>
        )}

        {activeTab === "variables" && (
          <div id="panel-variables" role="tabpanel" aria-labelledby="tab-variables" tabIndex={0}>
            <VariablesPanel
              variables={project.variables}
              variableIssues={variableIssues}
              onAddVariable={onAddVariable}
              onUpdateVariable={onUpdateVariable}
              onDeleteVariable={onDeleteVariable}
            />
          </div>
        )}
      </div>
    </aside>
  );
};
