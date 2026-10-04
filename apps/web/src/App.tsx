import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
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
import {
  StoryNode,
  STORY_NODE_WIDTH,
  STORY_NODE_HEIGHT,
  type StoryNodeData,
} from "./components/StoryNode.js";
import { StoryEdge, type StoryEdgeData } from "./components/StoryEdge.js";
import { IssuesPanel } from "./components/IssuesPanel.js";

const nodeTypes = {
  storyNode: StoryNode,
};

const edgeTypes = {
  storyEdge: StoryEdge,
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
  const { setCenter, getViewport } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const grouped = useMemo(() => groupIssues(project, issues), [project, issues]);
  const layout = useMemo(() => computeLayout(project), [project]);

  // Outcome 5: Pan to selected node only if it is outside current viewport
  useEffect(() => {
    if (!selectedNodeId) return;
    const pos = layout.get(selectedNodeId);
    if (!pos) return;

    const targetX = pos.x + STORY_NODE_WIDTH / 2;
    const targetY = pos.y + STORY_NODE_HEIGHT / 2;

    const vp = getViewport();
    const container = wrapperRef.current;
    const width = container?.clientWidth || 1000;
    const height = container?.clientHeight || 800;

    const minX = -vp.x / vp.zoom;
    const maxX = (width - vp.x) / vp.zoom;
    const minY = -vp.y / vp.zoom;
    const maxY = (height - vp.y) / vp.zoom;

    const isOutside =
      pos.x + STORY_NODE_WIDTH < minX ||
      pos.x > maxX ||
      pos.y + STORY_NODE_HEIGHT < minY ||
      pos.y > maxY;

    if (isOutside) {
      const targetZoom = Math.max(vp.zoom, 0.65);
      void setCenter(targetX, targetY, {
        duration: 400,
        zoom: targetZoom,
      });
    }
  }, [selectedNodeId, layout, getViewport, setCenter]);

  // Outcome 5: Pan to selected edge only if it is outside current viewport
  useEffect(() => {
    if (!selectedEdgeId) return;
    const edge = project.edges.find((e) => e.id === selectedEdgeId);
    if (!edge) return;
    const fromPos = layout.get(edge.from);
    const toPos = layout.get(edge.to);
    if (!fromPos || !toPos) return;

    const targetX = (fromPos.x + toPos.x + STORY_NODE_WIDTH) / 2;
    const targetY = (fromPos.y + toPos.y + STORY_NODE_HEIGHT) / 2;

    const vp = getViewport();
    const container = wrapperRef.current;
    const width = container?.clientWidth || 1000;
    const height = container?.clientHeight || 800;

    const minX = -vp.x / vp.zoom;
    const maxX = (width - vp.x) / vp.zoom;
    const minY = -vp.y / vp.zoom;
    const maxY = (height - vp.y) / vp.zoom;

    const isOutside =
      targetX < minX ||
      targetX > maxX ||
      targetY < minY ||
      targetY > maxY;

    if (isOutside) {
      const targetZoom = Math.max(vp.zoom, 0.65);
      void setCenter(targetX, targetY, {
        duration: 400,
        zoom: targetZoom,
      });
    }
  }, [selectedEdgeId, project.edges, layout, getViewport, setCenter]);

  const nodes: Node<StoryNodeData>[] = useMemo(() => {
    return project.nodes.map((node) => ({
      id: node.id,
      type: "storyNode",
      position: layout.get(node.id) ?? { x: 0, y: 0 },
      initialWidth: STORY_NODE_WIDTH,
      initialHeight: STORY_NODE_HEIGHT,
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

  const edges: Edge<StoryEdgeData>[] = useMemo(() => {
    return project.edges.map((edge) => {
      const edgeIssues = grouped.byEdge.get(edge.id) ?? [];
      const hasIssue = edgeIssues.length > 0;

      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: "storyEdge",
        selected: selectedEdgeId === edge.id,
        animated: hasIssue,
        style: {
          stroke: hasIssue ? "var(--color-error)" : "var(--color-edge)",
          strokeWidth: hasIssue ? 2.5 : 1.5,
        },
        data: {
          condition: edge.condition,
          effects: edge.effects,
          hasIssue,
          onSelect: onEdgeClick,
        },
      };
    });
  }, [project.edges, grouped.byEdge, selectedEdgeId, onEdgeClick]);

  return (
    <div className="canvas-wrapper" ref={wrapperRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.08, minZoom: 0.1 }}
        minZoom={0.1}
        maxZoom={2}
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
          nodeStrokeWidth={2}
          nodeStrokeColor="#1e293b"
          nodeBorderRadius={4}
          nodeColor={(n) => {
            const data = (n as Node<StoryNodeData>).data;
            const issuesForNode = data?.issues ?? [];
            const hasErrors = issuesForNode.some((i) => i.severity === "error");
            const hasWarnings = issuesForNode.some((i) => i.severity === "warning");

            if (hasErrors) return "#ef4444";
            if (hasWarnings) return "#f59e0b";
            if (data?.nodeType === "start") return "#10b981";
            if (data?.nodeType === "end") return "#a855f7";
            return "#6366f1";
          }}
          maskColor="rgba(10, 15, 29, 0.75)"
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
