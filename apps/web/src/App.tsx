import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { check } from "@repo/checker";
import type { Issue } from "@repo/schema";
import { getSampleProjectWithSyntaxError } from "./demo/sampleProject.js";
import { computeLayout } from "./lib/layout.js";
import { groupIssues } from "./lib/decorate.js";
import { StoryNode, type StoryNodeData } from "./components/StoryNode.js";
import { IssuesPanel } from "./components/IssuesPanel.js";

const nodeTypes = {
  storyNode: StoryNode,
};

function StoryCanvas({
  project,
  issues,
  selectedNodeId,
  selectedEdgeId,
  onNodeClick,
  onEdgeClick,
}: {
  project: ReturnType<typeof getSampleProjectWithSyntaxError>;
  issues: Issue[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onNodeClick: (nodeId: string) => void;
  onEdgeClick: (edgeId: string) => void;
}) {
  const { fitView } = useReactFlow();
  const grouped = useMemo(() => groupIssues(project, issues), [project, issues]);
  const layout = useMemo(() => computeLayout(project), [project]);

  useEffect(() => {
    if (selectedNodeId) {
      fitView({
        nodes: [{ id: selectedNodeId }],
        duration: 500,
        maxZoom: 1.2,
      });
    }
  }, [selectedNodeId, fitView]);

  useEffect(() => {
    if (selectedEdgeId) {
      const edge = project.edges.find((e) => e.id === selectedEdgeId);
      if (edge) {
        fitView({
          nodes: [{ id: edge.from }, { id: edge.to }],
          duration: 500,
          padding: 0.3,
        });
      }
    }
  }, [selectedEdgeId, project.edges, fitView]);

  const nodes: Node<StoryNodeData>[] = useMemo(() => {
    return project.nodes.map((node) => ({
      id: node.id,
      type: "storyNode",
      position: layout.get(node.id) ?? { x: 0, y: 0 },
      data: {
        title: node.title,
        nodeType: node.type,
        issues: grouped.byNode.get(node.id) ?? [],
      },
      selected: selectedNodeId === node.id,
      selectable: true,
      draggable: false,
    }));
  }, [project.nodes, layout, grouped.byNode, selectedNodeId]);

  const edges: Edge[] = useMemo(() => {
    return project.edges.map((edge) => {
      const edgeIssues = grouped.byEdge.get(edge.id) ?? [];
      const hasIssue = edgeIssues.length > 0;

      let labelText = "";
      if (edge.condition) {
        labelText += `[${edge.condition}] `;
      }
      if (edge.effects && edge.effects.length > 0) {
        labelText += `(${edge.effects.length} fx)`;
      }

      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: labelText.trim() || undefined,
        selected: selectedEdgeId === edge.id,
        animated: hasIssue,
        style: {
          stroke: hasIssue ? "var(--color-error)" : "var(--color-edge)",
          strokeWidth: hasIssue ? 2.5 : 1.5,
        },
        labelStyle: {
          fill: hasIssue ? "var(--color-error)" : "var(--text-secondary)",
          fontWeight: hasIssue ? 600 : 400,
          fontSize: 11,
        },
        labelBgStyle: {
          fill: "var(--bg-surface)",
          fillOpacity: 0.9,
          stroke: hasIssue ? "var(--color-error)" : "var(--border-subtle)",
          strokeWidth: 1,
        },
      };
    });
  }, [project.edges, grouped.byEdge, selectedEdgeId]);

  return (
    <div className="canvas-wrapper">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        onNodeClick={(_event, node) => onNodeClick(node.id)}
        onEdgeClick={(_event, edge) => onEdgeClick(edge.id)}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} className="canvas-controls" />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(n) => {
            const data = n.data as unknown as StoryNodeData;
            if (data?.nodeType === "start") return "var(--color-start)";
            if (data?.nodeType === "end") return "var(--color-end)";
            return "var(--color-scene)";
          }}
          maskColor="rgba(10, 15, 29, 0.7)"
          className="canvas-minimap"
        />
      </ReactFlow>
    </div>
  );
}

export function App() {
  const [includeSyntaxError, setIncludeSyntaxError] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const project = useMemo(
    () => getSampleProjectWithSyntaxError(includeSyntaxError),
    [includeSyntaxError],
  );

  const issues = useMemo(() => check(project), [project]);

  const handleSelectIssue = useCallback(
    (issue: Issue) => {
      setSelectedIssue(issue);

      if (issue.location) {
        setSelectedEdgeId(issue.location.edgeId);
        setSelectedNodeId(null);
      } else if (issue.nodeId) {
        setSelectedNodeId(issue.nodeId);
        setSelectedEdgeId(null);
      } else {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      }
    },
    [],
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <div className="header-badge">Lumio Narrative Studio</div>
          <h1 className="header-title">{project.name}</h1>
        </div>
        <div className="header-right">
          <div className="toggle-group">
            <span className="toggle-label" id="syntax-toggle-label">
              Syntax error test:
            </span>
            <button
              type="button"
              className={`btn-toggle ${includeSyntaxError ? "active" : ""}`}
              onClick={() => setIncludeSyntaxError((prev) => !prev)}
              aria-labelledby="syntax-toggle-label"
              id="btn-syntax-toggle"
            >
              {includeSyntaxError ? "ON (invalid-expression)" : "OFF (usage rules active)"}
            </button>
          </div>
          <div className="stats-pill">
            <span>{project.nodes.length} nodes</span>
            <span>•</span>
            <span>{project.edges.length} edges</span>
            <span>•</span>
            <span>{project.variables.length} vars</span>
          </div>
        </div>
      </header>

      <main className="app-main">
        <ReactFlowProvider>
          <StoryCanvas
            project={project}
            issues={issues}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            onNodeClick={(id) => {
              setSelectedNodeId(id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(id) => {
              setSelectedEdgeId(id);
              setSelectedNodeId(null);
            }}
          />
        </ReactFlowProvider>

        <IssuesPanel
          project={project}
          issues={issues}
          selectedIssue={selectedIssue}
          onSelectIssue={handleSelectIssue}
        />
      </main>
    </div>
  );
}

export default App;
