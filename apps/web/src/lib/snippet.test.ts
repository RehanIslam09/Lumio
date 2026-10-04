import { describe, expect, it } from "vitest";
import type { Issue, Project } from "@repo/schema";
import { getIssueSnippet } from "./snippet.js";

describe("getIssueSnippet", () => {
  const project: Project = {
    id: "p1",
    name: "Snippet Test",
    nodes: [
      { id: "start", type: "start", title: "Start" },
      { id: "end", type: "end", title: "End" },
    ],
    edges: [
      {
        id: "e1",
        from: "start",
        to: "end",
        condition: "score > 100",
        effects: ["gold += 50", 'quest_status = "completed"'],
      },
    ],
    variables: [],
  };

  it("returns undefined for issue without location", () => {
    const issue: Issue = {
      ruleId: "unreachable-from-start",
      severity: "warning",
      nodeId: "start",
      message: "Node is unreachable",
    };

    expect(getIssueSnippet(project, issue)).toBeUndefined();
  });

  it("returns condition text and span for condition issue", () => {
    const issue: Issue = {
      ruleId: "undefined-variable",
      severity: "error",
      nodeId: "start",
      location: {
        edgeId: "e1",
        field: "condition",
        start: 0,
        end: 5,
      },
      message: "Undefined variable score",
    };

    const snippet = getIssueSnippet(project, issue);
    expect(snippet).toEqual({
      text: "score > 100",
      start: 0,
      end: 5,
    });
  });

  it("returns effect text and span for effect issue", () => {
    const issue: Issue = {
      ruleId: "type-mismatch",
      severity: "error",
      nodeId: "start",
      location: {
        edgeId: "e1",
        field: "effect",
        effectIndex: 1,
        start: 0,
        end: 12,
      },
      message: "Type mismatch",
    };

    const snippet = getIssueSnippet(project, issue);
    expect(snippet).toEqual({
      text: 'quest_status = "completed"',
      start: 0,
      end: 12,
    });
  });

  it("clamps out-of-bounds start and end to text length", () => {
    const issue: Issue = {
      ruleId: "invalid-expression",
      severity: "error",
      nodeId: "start",
      location: {
        edgeId: "e1",
        field: "condition",
        start: -5,
        end: 999,
      },
      message: "Error",
    };

    const snippet = getIssueSnippet(project, issue);
    expect(snippet).toEqual({
      text: "score > 100",
      start: 0,
      end: 11, // length of "score > 100"
    });
  });

  it("returns undefined when edge is missing from project", () => {
    const issue: Issue = {
      ruleId: "invalid-expression",
      severity: "error",
      nodeId: "start",
      location: {
        edgeId: "ghost_edge",
        field: "condition",
        start: 0,
        end: 5,
      },
      message: "Error",
    };

    expect(getIssueSnippet(project, issue)).toBeUndefined();
  });

  it("returns undefined when effect index is missing or out of bounds", () => {
    const issue: Issue = {
      ruleId: "invalid-expression",
      severity: "error",
      nodeId: "start",
      location: {
        edgeId: "e1",
        field: "effect",
        effectIndex: 99,
        start: 0,
        end: 5,
      },
      message: "Error",
    };

    expect(getIssueSnippet(project, issue)).toBeUndefined();
  });
});
