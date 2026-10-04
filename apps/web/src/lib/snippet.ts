import type { Issue, Project } from "@repo/schema";

export interface IssueSnippet {
  text: string;
  start: number;
  end: number;
}

/**
 * Extracts and clamps the source text snippet and error span for an issue with a location.
 * Returns undefined if the issue has no location, or the target edge/effect is missing.
 */
export function getIssueSnippet(
  project: Project,
  issue: Issue,
): IssueSnippet | undefined {
  if (!issue.location) {
    return undefined;
  }

  const edge = project.edges.find((e) => e.id === issue.location?.edgeId);
  if (!edge) {
    return undefined;
  }

  let text: string | undefined;
  if (issue.location.field === "condition") {
    text = edge.condition;
  } else if (issue.location.field === "effect") {
    const idx = issue.location.effectIndex ?? 0;
    text = edge.effects?.[idx];
  }

  if (text === undefined) {
    return undefined;
  }

  const start = Math.max(0, Math.min(issue.location.start, text.length));
  const end = Math.max(start, Math.min(issue.location.end, text.length));

  return { text, start, end };
}
