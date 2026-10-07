import type { Issue, Project } from "@repo/schema";

export interface GroupedIssues {
  byNode: Map<string, Issue[]>;
  byEdge: Map<string, Issue[]>;
  byVariable: Map<string, Issue[]>;
  byEntity: Map<string, Issue[]>;
}

/**
 * Groups checker issues into node-level, edge-level, variable-level, and entity-level maps.
 * - node-level issues (nodeId, no location) -> byNode
 * - edge-level issues (has location) -> byEdge ONLY (not byNode)
 * - variable-level issues (variableId) -> byVariable
 * - entity-level issues (entityId) -> byEntity
 */
export function groupIssues(
  _project: Project,
  issues: Issue[],
): GroupedIssues {
  const byNode = new Map<string, Issue[]>();
  const byEdge = new Map<string, Issue[]>();
  const byVariable = new Map<string, Issue[]>();
  const byEntity = new Map<string, Issue[]>();

  function addIssue(map: Map<string, Issue[]>, key: string, issue: Issue): void {
    const list = map.get(key);
    if (list) {
      list.push(issue);
    } else {
      map.set(key, [issue]);
    }
  }

  for (const issue of issues) {
    if (issue.location) {
      // Edge-level issues go to byEdge ONLY (not byNode)
      addIssue(byEdge, issue.location.edgeId, issue);
    } else if (issue.nodeId) {
      addIssue(byNode, issue.nodeId, issue);
    } else if (issue.variableId) {
      addIssue(byVariable, issue.variableId, issue);
    } else if (issue.entityId) {
      addIssue(byEntity, issue.entityId, issue);
    }
  }

  return { byNode, byEdge, byVariable, byEntity };
}
