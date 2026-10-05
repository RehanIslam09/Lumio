import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  ControlButton,
  MiniMap,
  useReactFlow,
  type Node,
  type NodeChange,
  type Connection,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { check } from "@repo/checker";
import type { Project, Issue, FlowNodeType, VariableType, Variable } from "@repo/schema";
import { getSampleProjectWithSyntaxError } from "./demo/sampleProject.js";
import { computeLayout } from "./lib/layout.js";
import { groupIssues } from "./lib/decorate.js";
import { projectToFlow, type Selection } from "./lib/flowModel.js";
import { makeNode, makeEdge, makeVariable } from "./lib/defaults.js";
import { interpretKey, isTargetEditable } from "./lib/keymap.js";
import { MIN_ZOOM, MAX_ZOOM } from "./lib/initialViewport.js";
import { useInitialViewport } from "./hooks/useInitialViewport.js";
import {
  createEditor,
  apply,
  undo,
  redo,
  canUndo,
  canRedo,
  type EditorState,
  type EditorAction,
} from "./editor/index.js";
import {
  serializeProject,
  parseProjectFile,
  checkFileSizeBytes,
  fileNameFor,
  isDirty,
  makeEmptyProject,
} from "./persistence/index.js";

import {
  StoryNode,
  STORY_NODE_WIDTH,
  STORY_NODE_HEIGHT,
  type StoryNodeData,
} from "./components/StoryNode.js";
import { StoryEdge } from "./components/StoryEdge.js";
import { Toolbar } from "./components/Toolbar.js";
import { MessageBar } from "./components/MessageBar.js";
import { RightPanel, type PanelTab } from "./components/RightPanel.js";

const nodeTypes = {
  storyNode: StoryNode,
};

const edgeTypes = {
  storyEdge: StoryEdge,
};

function StoryCanvas({
  project,
  issues,
  selection,
  layout,
  loadCounter,
  onNodeSelect,
  onEdgeSelect,
  onPaneClick,
  onConnect,
  onMoveNode,
}: {
  project: EditorState["present"];
  issues: Issue[];
  selection: Selection;
  layout: Map<string, { x: number; y: number }>;
  loadCounter: number;
  onNodeSelect: (id: string) => void;
  onEdgeSelect: (id: string) => void;
  onPaneClick: () => void;
  onConnect: (connection: Connection) => void;
  onMoveNode: (id: string, position: { x: number; y: number }) => void;
}) {
  const { setCenter, getViewport } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [tipDismissed, setTipDismissed] = useState(false);
  const [dragOverrides, setDragOverrides] = useState<Map<string, { x: number; y: number }>>(
    new Map(),
  );

  const { isReady, goToStart } = useInitialViewport({
    project,
    positions: layout,
    loadCounter,
  });

  // Controlled position tracking for live dragging
  const effectivePositions = useMemo(() => {
    const map = new Map(layout);
    for (const [id, pos] of dragOverrides) {
      map.set(id, pos);
    }
    return map;
  }, [layout, dragOverrides]);

  const { nodes, edges } = useMemo(() => {
    return projectToFlow(project, effectivePositions, selection, issues, onEdgeSelect);
  }, [project, effectivePositions, selection, issues, onEdgeSelect]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setDragOverrides((prev) => {
      let updated = prev;
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          if (updated === prev) updated = new Map(prev);
          updated.set(change.id, change.position);
        }
      }
      return updated;
    });
  }, []);

  const handleNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      const renderedPos = layout.get(node.id);
      const finalX = Math.round(node.position.x);
      const finalY = Math.round(node.position.y);

      if (
        renderedPos &&
        (finalX !== Math.round(renderedPos.x) || finalY !== Math.round(renderedPos.y))
      ) {
        onMoveNode(node.id, { x: finalX, y: finalY });
      }
      setDragOverrides(new Map());
    },
    [layout, onMoveNode],
  );

  // Pan to selected entity if it is outside current viewport
  useEffect(() => {
    if (!selection) return;

    let targetX = 0;
    let targetY = 0;

    if (selection.kind === "node") {
      const pos = layout.get(selection.id);
      if (!pos) return;
      targetX = pos.x + STORY_NODE_WIDTH / 2;
      targetY = pos.y + STORY_NODE_HEIGHT / 2;
    } else {
      const edge = project.edges.find((e) => e.id === selection.id);
      if (!edge) return;
      const fromPos = layout.get(edge.from);
      const toPos = layout.get(edge.to);
      if (!fromPos || !toPos) return;
      targetX = (fromPos.x + toPos.x + STORY_NODE_WIDTH) / 2;
      targetY = (fromPos.y + toPos.y + STORY_NODE_HEIGHT) / 2;
    }

    const vp = getViewport();
    const container = wrapperRef.current;
    const width = container?.clientWidth || 1000;
    const height = container?.clientHeight || 800;

    const minX = -vp.x / vp.zoom;
    const maxX = (width - vp.x) / vp.zoom;
    const minY = -vp.y / vp.zoom;
    const maxY = (height - vp.y) / vp.zoom;

    const isOutside =
      targetX < minX || targetX > maxX || targetY < minY || targetY > maxY;

    if (isOutside) {
      const targetZoom = Math.max(vp.zoom, 0.65);
      void setCenter(targetX, targetY, {
        duration: 400,
        zoom: targetZoom,
      });
    }
  }, [selection, project.edges, layout, getViewport, setCenter]);

  return (
    <div
      className="canvas-wrapper"
      ref={wrapperRef}
      style={{ visibility: isReady ? "visible" : "hidden" }}
    >
      {!tipDismissed && (
        <div className="canvas-tip-overlay" role="note">
          <div className="canvas-tip-card">
            <p className="canvas-tip-text">
              Tip: drag from the dot on a node's right edge to the dot on another node's left edge to connect them.
            </p>
            <button
              type="button"
              className="canvas-tip-dismiss-btn"
              onClick={() => setTipDismissed(true)}
              aria-label="Dismiss tip"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        edgesReconnectable={false}
        connectionRadius={30}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        selectionKeyCode={null}
        selectionOnDrag={false}
        panOnDrag={true}
        zoomOnScroll={true}
        onNodesChange={handleNodesChange}
        onNodeDragStop={handleNodeDragStop}
        onConnect={onConnect}
        onNodeClick={(_event, node) => onNodeSelect(node.id)}
        onEdgeClick={(_event, edge) => onEdgeSelect(edge.id)}
        onPaneClick={onPaneClick}
        fitViewOptions={{ padding: 0.08, minZoom: MIN_ZOOM }}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} className="canvas-controls">
          <ControlButton
            onClick={goToStart}
            title="Go to start"
            aria-label="Go to start"
            className="react-flow__controls-gotostart"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
          </ControlButton>
        </Controls>
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

function MainStudio() {
  const { screenToFlowPosition } = useReactFlow();
  const [editorState, setEditorState] = useState<EditorState>(() =>
    createEditor(getSampleProjectWithSyntaxError(false)),
  );
  const [savedPresent, setSavedPresent] = useState<Project>(() => editorState.present);
  const [loadCounter, setLoadCounter] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selection, setSelected] = useState<Selection>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>("issues");

  const project = editorState.present;
  const dirty = isDirty(editorState, savedPresent);

  const dispatch = useCallback((action: EditorAction): boolean => {
    let success = false;
    setEditorState((current) => {
      const res = apply(current, action);
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return current;
      }
      setErrorMessage(null);
      success = true;
      return res.state;
    });
    return success;
  }, []);

  const handleUndo = useCallback(() => {
    setEditorState((current) => undo(current));
    setErrorMessage(null);
  }, []);

  const handleRedo = useCallback(() => {
    setEditorState((current) => redo(current));
    setErrorMessage(null);
  }, []);

  const handleReset = useCallback(() => {
    if (isDirty(editorState, savedPresent)) {
      const ok = window.confirm("Reset project to sample? Unsaved changes will be lost.");
      if (!ok) return;
    }
    const sample = getSampleProjectWithSyntaxError(false);
    setEditorState(createEditor(sample));
    setSavedPresent(sample);
    setLoadCounter((c) => c + 1);
    setSelected(null);
    setSelectedIssue(null);
    setErrorMessage(null);
  }, [editorState, savedPresent]);

  const handleNew = useCallback(() => {
    if (isDirty(editorState, savedPresent)) {
      const ok = window.confirm("Create new project? Unsaved changes will be lost.");
      if (!ok) return;
    }
    const empty = makeEmptyProject(crypto.randomUUID(), "Untitled story");
    setEditorState(createEditor(empty));
    setSavedPresent(empty);
    setLoadCounter((c) => c + 1);
    setSelected(null);
    setSelectedIssue(null);
    setErrorMessage(null);
  }, [editorState, savedPresent]);

  const handleSave = useCallback(() => {
    const text = serializeProject(project, new Date().toISOString());
    const fileName = fileNameFor(project.name);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSavedPresent(project);
  }, [project]);

  const handleOpen = useCallback(
    (file: File) => {
      const preSizeError = checkFileSizeBytes(file.size);
      if (preSizeError && !preSizeError.ok) {
        setErrorMessage(preSizeError.error.message);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text !== "string") {
          setErrorMessage("Failed to read file as text.");
          return;
        }

        const res = parseProjectFile(text);
        if (!res.ok) {
          let msg = res.error.message;
          if (res.error.details.length > 0) {
            msg += `:\n${res.error.details.join("\n")}`;
          }
          setErrorMessage(msg);
          return;
        }

        if (isDirty(editorState, savedPresent)) {
          const ok = window.confirm("Replace the current project? Unsaved changes will be lost.");
          if (!ok) return;
        }

        setEditorState(createEditor(res.project));
        setSavedPresent(res.project);
        setLoadCounter((c) => c + 1);
        setSelected(null);
        setSelectedIssue(null);

        if (res.warnings.length > 0) {
          setErrorMessage(`Project opened with warnings:\n${res.warnings.join("\n")}`);
        } else {
          setErrorMessage(null);
        }
      };
      reader.onerror = () => {
        setErrorMessage("Failed to read file: FileReader error.");
      };
      reader.readAsText(file);
    },
    [editorState, savedPresent],
  );

  // Warning when leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty(editorState, savedPresent)) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editorState, savedPresent]);

  // Consistency checker main-thread evaluation
  const issues = useMemo(() => check(project), [project]);
  const grouped = useMemo(() => groupIssues(project, issues), [project, issues]);
  const layout = useMemo(() => computeLayout(project), [project]);

  // Derive valid selection (cleared if entity is deleted or removed via undo)
  const effectiveSelection: Selection = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === "node") {
      return project.nodes.some((n) => n.id === selection.id) ? selection : null;
    }
    if (selection.kind === "edge") {
      return project.edges.some((e) => e.id === selection.id) ? selection : null;
    }
    return null;
  }, [selection, project.nodes, project.edges]);

  // Global key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetIsEditable = isTargetEditable(e.target);
      const action = interpretKey({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        targetIsEditable,
      });

      if (action === "undo") {
        e.preventDefault();
        handleUndo();
      } else if (action === "redo") {
        e.preventDefault();
        handleRedo();
      } else if (action === "delete") {
        if (effectiveSelection) {
          e.preventDefault();
          if (effectiveSelection.kind === "node") {
            dispatch({ type: "deleteNode", id: effectiveSelection.id });
          } else if (effectiveSelection.kind === "edge") {
            dispatch({ type: "deleteEdge", id: effectiveSelection.id });
          }
          setSelected(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo, effectiveSelection, dispatch]);

  const handleAddNode = useCallback(
    (type: FlowNodeType) => {
      const container = document.querySelector(".canvas-wrapper");
      const rect = container?.getBoundingClientRect();
      const screenX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const screenY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
      const flowPos = screenToFlowPosition({ x: screenX, y: screenY });

      const nodePos = {
        x: Math.round(flowPos.x - STORY_NODE_WIDTH / 2),
        y: Math.round(flowPos.y - STORY_NODE_HEIGHT / 2),
      };

      const node = makeNode(type, project.nodes.map((n) => n.id), nodePos);
      dispatch({ type: "addNode", node });
      setSelected({ kind: "node", id: node.id });
      setActiveTab("inspector");
    },
    [project.nodes, screenToFlowPosition, dispatch],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const edge = makeEdge(connection.source, connection.target, project.edges.map((e) => e.id));
      const ok = dispatch({ type: "addEdge", edge });
      if (ok) {
        setSelected({ kind: "edge", id: edge.id });
        setActiveTab("inspector");
      }
    },
    [project.edges, dispatch],
  );

  const handleConnectNodes = useCallback(
    (fromId: string, toId: string) => {
      const edge = makeEdge(fromId, toId, project.edges.map((e) => e.id));
      const ok = dispatch({ type: "addEdge", edge });
      if (ok) {
        setSelected({ kind: "edge", id: edge.id });
      }
    },
    [project.edges, dispatch],
  );

  const handleSelectIssue = useCallback((issue: Issue) => {
    setSelectedIssue(issue);
    if (issue.location) {
      setSelected({ kind: "edge", id: issue.location.edgeId });
    } else if (issue.nodeId) {
      setSelected({ kind: "node", id: issue.nodeId });
    }
  }, []);

  const selectedNodeIssues = useMemo(() => {
    if (effectiveSelection?.kind !== "node") return [];
    return grouped.byNode.get(effectiveSelection.id) ?? [];
  }, [effectiveSelection, grouped.byNode]);

  const selectedEdgeIssues = useMemo(() => {
    if (effectiveSelection?.kind !== "edge") return [];
    return grouped.byEdge.get(effectiveSelection.id) ?? [];
  }, [effectiveSelection, grouped.byEdge]);

  return (
    <div className="app-container">
      <Toolbar
        projectName={project.name}
        isDirty={dirty}
        canUndo={canUndo(editorState)}
        canRedo={canRedo(editorState)}
        nodesCount={project.nodes.length}
        edgesCount={project.edges.length}
        varsCount={project.variables.length}
        onRenameProject={(name) => dispatch({ type: "renameProject", name })}
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        onAddNode={handleAddNode}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onReset={handleReset}
      />

      <MessageBar
        message={errorMessage}
        onDismiss={() => setErrorMessage(null)}
      />

      <main className="app-main">
        <StoryCanvas
          project={project}
          issues={issues}
          selection={effectiveSelection}
          layout={layout}
          loadCounter={loadCounter}
          onNodeSelect={(id) => {
            setSelected({ kind: "node", id });
            setActiveTab("inspector");
          }}
          onEdgeSelect={(id) => {
            setSelected({ kind: "edge", id });
            setActiveTab("inspector");
          }}
          onPaneClick={() => setSelected(null)}
          onConnect={handleConnect}
          onMoveNode={(id, pos) => dispatch({ type: "moveNode", id, position: pos })}
        />

        <RightPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          project={project}
          issues={issues}
          selectedIssue={selectedIssue}
          selection={effectiveSelection}
          onSelectIssue={handleSelectIssue}
          nodeIssues={selectedNodeIssues}
          edgeIssues={selectedEdgeIssues}
          variableIssues={grouped.byVariable}
          onUpdateNode={(id, patch) => dispatch({ type: "updateNode", id, patch })}
          onDeleteNode={(id) => {
            dispatch({ type: "deleteNode", id });
            setSelected(null);
          }}
          onUpdateEdge={(id, patch) => dispatch({ type: "updateEdge", id, patch })}
          onDeleteEdge={(id) => {
            dispatch({ type: "deleteEdge", id });
            setSelected(null);
          }}
          onSelectNode={(id) => setSelected({ kind: "node", id })}
          onSelectEdge={(id) => setSelected({ kind: "edge", id })}
          onConnectNodes={handleConnectNodes}
          onAddVariable={() => {
            const v = makeVariable(project.variables);
            dispatch({ type: "addVariable", variable: v });
          }}
          onUpdateVariable={(id, patch: { name?: string; type?: VariableType; initial?: Variable["initial"] | null }) => {
            dispatch({ type: "updateVariable", id, patch });
          }}
          onDeleteVariable={(id) => dispatch({ type: "deleteVariable", id })}
        />
      </main>
    </div>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <MainStudio />
    </ReactFlowProvider>
  );
}

export default App;
