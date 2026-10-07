import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { Issue, Project } from "@repo/schema";
import { groupIssues } from "./decorate.js";

describe("groupIssues", () => {
  const dummyProject: Project = {
    id: "p1",
    name: "Decorate Test",
    nodes: [
      { id: "start", type: "start", title: "Start" },
      { id: "end", type: "end", title: "End" },
    ],
    edges: [{ id: "e1", from: "start", to: "end" }],
    variables: [{ id: "v1", name: "x", type: "number" }],
  };

  it("node-level issues go to byNode", () => {
    const issues: Issue[] = [
      {
        ruleId: "unreachable-from-start",
        severity: "warning",
        nodeId: "start",
        message: "Unreachable",
      },
    ];

    const grouped = groupIssues(dummyProject, issues);
    expect(grouped.byNode.get("start")).toEqual(issues);
    expect(grouped.byEdge.size).toBe(0);
    expect(grouped.byVariable.size).toBe(0);
  });

  it("edge-level issues with location go to byEdge ONLY, never byNode", () => {
    const issues: Issue[] = [
      {
        ruleId: "invalid-expression",
        severity: "error",
        nodeId: "start",
        location: {
          edgeId: "e1",
          field: "condition",
          start: 0,
          end: 5,
        },
        message: "Syntax error",
      },
    ];

    const grouped = groupIssues(dummyProject, issues);
    expect(grouped.byEdge.get("e1")).toEqual(issues);
    expect(grouped.byNode.size).toBe(0);
    expect(grouped.byVariable.size).toBe(0);
  });

  it("variable-level issues go to byVariable", () => {
    const issues: Issue[] = [
      {
        ruleId: "unused-variable",
        severity: "warning",
        variableId: "v1",
        message: 'Variable "x" is declared but never used.',
      },
    ];

    const grouped = groupIssues(dummyProject, issues);
    expect(grouped.byVariable.get("v1")).toEqual(issues);
    expect(grouped.byNode.size).toBe(0);
    expect(grouped.byEdge.size).toBe(0);
  });

  it("entity-level issues go to byEntity", () => {
    const issues: Issue[] = [
      {
        ruleId: "character-never-speaks",
        severity: "warning",
        entityId: "e1",
        message: 'Character "Alice" is never used as a speaker.',
      },
    ];

    const grouped = groupIssues(dummyProject, issues);
    expect(grouped.byEntity.get("e1")).toEqual(issues);
    expect(grouped.byNode.size).toBe(0);
    expect(grouped.byEdge.size).toBe(0);
    expect(grouped.byVariable.size).toBe(0);
  });

  it("Property: every issue lands in exactly one map entry, and total count across three maps equals issues.length", () => {
    const issueArbitrary = fc.oneof(
      // Node issue
      fc.record({
        ruleId: fc.constantFrom<Issue["ruleId"]>(
          "unreachable-from-start",
          "cannot-reach-end",
        ),
        severity: fc.constantFrom<Issue["severity"]>("error", "warning"),
        nodeId: fc.constantFrom("node_a", "node_b", "node_c"),
        message: fc.string(),
      }),
      // Edge issue
      fc.record({
        ruleId: fc.constantFrom<Issue["ruleId"]>(
          "invalid-expression",
          "undefined-variable",
          "type-mismatch",
        ),
        severity: fc.constantFrom<Issue["severity"]>("error", "warning"),
        nodeId: fc.constantFrom("node_a", "node_b"),
        location: fc.record({
          edgeId: fc.constantFrom("edge_1", "edge_2"),
          field: fc.constantFrom<"condition" | "effect">("condition", "effect"),
          start: fc.nat({ max: 20 }),
          end: fc.nat({ max: 20 }),
        }),
        message: fc.string(),
      }),
      // Variable issue
      fc.record({
        ruleId: fc.constantFrom<Issue["ruleId"]>(
          "unused-variable",
          "variable-never-written",
          "variable-never-read",
        ),
        severity: fc.constantFrom<Issue["severity"]>("error", "warning"),
        variableId: fc.constantFrom("var_1", "var_2"),
        message: fc.string(),
      }),
    );

    fc.assert(
      fc.property(fc.array(issueArbitrary, { maxLength: 30 }), (issues) => {
        const grouped = groupIssues(dummyProject, issues);

        let totalGrouped = 0;
        for (const list of grouped.byNode.values()) {
          totalGrouped += list.length;
        }
        for (const list of grouped.byEdge.values()) {
          totalGrouped += list.length;
        }
        for (const list of grouped.byVariable.values()) {
          totalGrouped += list.length;
        }

        expect(totalGrouped).toBe(issues.length);
      }),
      { numRuns: 100 },
    );
  });
});
