import type { Node, Edge } from "@xyflow/react";
import type { Project, Issue } from "@repo/schema";
import {
  STORY_NODE_WIDTH,
  STORY_NODE_HEIGHT,
  type StoryNodeData,
} from "../components/StoryNode.js";
import type { StoryEdgeData } from "../components/StoryEdge.js";
import { groupIssues } from "./decorate.js";

export type Selection = { kind: "node" | "edge"; id: string } | null;

export interface FlowModel {
  nodes: Node<StoryNodeData>[];
  edges: Edge<StoryEdgeData>[];
}

/**
 * Transforms domain Project into React Flow nodes and edges.
 * Skips dangling edges whose source or target nodes do not exist.
 */
export function projectToFlow(
  project: Project,
  positions: ReadonlyMap<string, { x: number; y: number }>,
  selection: Selection,
  issues?: Issue[],
  onEdgeSelect?: (id: string) => void,
): FlowModel {
  const grouped = issues ? groupIssues(project, issues) : null;
  const nodeIds = new Set(project.nodes.map((n) => n.id));
  const entityMap = new Map((project.entities ?? []).map((e) => [e.id, e.name]));

  const nodes: Node<StoryNodeData>[] = project.nodes.map((node) => {
    let speakerName: string | null = null;
    if (node.speakerId) {
      speakerName = entityMap.get(node.speakerId) ?? node.speakerId;
    }

    let bodySnippet: string | null = null;
    if (node.body && node.body.trim().length > 0) {
      const clean = node.body
        .replace(/[*_#>`~]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (clean.length > 0) {
        bodySnippet = clean.length > 60 ? clean.slice(0, 57) + "…" : clean;
      }
    }

    return {
      id: node.id,
      type: "storyNode",
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      initialWidth: STORY_NODE_WIDTH,
      initialHeight: STORY_NODE_HEIGHT,
      data: {
        title: node.title,
        nodeType: node.type,
        issues: grouped?.byNode.get(node.id) ?? [],
        speakerName,
        bodySnippet,
      },
      selected: selection?.kind === "node" && selection.id === node.id,
      selectable: true,
      draggable: true,
    };
  });

  const edges: Edge<StoryEdgeData>[] = [];
  for (const edge of project.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      continue;
    }

    const edgeIssues = grouped?.byEdge.get(edge.id) ?? [];
    const hasIssue = edgeIssues.length > 0;

    edges.push({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: "storyEdge",
      selected: selection?.kind === "edge" && selection.id === edge.id,
      animated: hasIssue,
      style: {
        stroke: hasIssue ? "var(--color-error)" : "var(--color-edge)",
        strokeWidth: hasIssue ? 2.5 : 1.5,
      },
      data: {
        condition: edge.condition,
        effects: edge.effects,
        hasIssue,
        onSelect: onEdgeSelect,
      },
    });
  }

  return { nodes, edges };
}
