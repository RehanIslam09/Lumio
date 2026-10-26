import { describe, it, expect } from "vitest";
import type { Finding, FindingKind } from "../playtest/crossCheck.js";
import {
  buildVerdict,
  getFindingSeverity,
  groupFindingsBySeverity,
  ALL_FINDING_KINDS,
  computeOutcomeDistribution,
} from "./simulationPresentation.js";

describe("simulationPresentation helper: buildVerdict (A11)", () => {
  it("handles no-start-node error state", () => {
    const verdict = buildVerdict({ ok: false, error: "no-start-node" });
    expect(verdict.sentence).toBe("Cannot run simulation: story graph has no Start node.");
    expect(verdict.severity).toBe("danger");
    expect(verdict.label).toBe("Missing Start Node");
  });

  it("handles all runs ended successfully (plural and singular)", () => {
    const verdictPlural = buildVerdict({
      ok: true,
      runs: 500,
      outcomeCounts: { ended: 500, stuck: 0, stepLimit: 0, error: 0 },
    });
    expect(verdictPlural.sentence).toBe("All 500 readers reached a story ending.");
    expect(verdictPlural.severity).toBe("success");
    expect(verdictPlural.label).toBe("All Endings Reached");

    const verdictSingular = buildVerdict({
      ok: true,
      runs: 1,
      outcomeCounts: { ended: 1, stuck: 0, stepLimit: 0, error: 0 },
    });
    expect(verdictSingular.sentence).toBe("All 1 reader reached a story ending.");
    expect(verdictSingular.severity).toBe("success");
  });

  it("handles zero ended with stuck-dominated outcomes", () => {
    const verdict = buildVerdict({
      ok: true,
      runs: 500,
      outcomeCounts: { ended: 0, stuck: 500, stepLimit: 0, error: 0 },
    });
    expect(verdict.sentence).toBe(
      "No reader finished your story. 0 of 500 reached an ending; all became stuck at scenes with unmet conditions."
    );
    expect(verdict.severity).toBe("danger");
    expect(verdict.label).toBe("Zero Endings Reached");
  });

  it("handles zero ended with loop-dominated outcomes", () => {
    const verdict = buildVerdict({
      ok: true,
      runs: 200,
      outcomeCounts: { ended: 0, stuck: 0, stepLimit: 200, error: 0 },
    });
    expect(verdict.sentence).toBe(
      "No reader finished your story. 0 of 200 reached an ending; all timed out in loops reaching the step limit."
    );
    expect(verdict.severity).toBe("danger");
  });

  it("handles zero ended with mixed stuck and loop outcomes", () => {
    const verdict = buildVerdict({
      ok: true,
      runs: 500,
      outcomeCounts: { ended: 0, stuck: 244, stepLimit: 256, error: 0 },
    });
    expect(verdict.sentence).toBe(
      "No reader finished your story. 0 of 500 reached an ending; playthroughs were stuck or timed out in loops."
    );
    expect(verdict.severity).toBe("danger");
  });

  it("handles partial completion with correct rounded percentage and pluralization", () => {
    const verdict = buildVerdict({
      ok: true,
      runs: 500,
      outcomeCounts: { ended: 350, stuck: 100, stepLimit: 50, error: 0 },
    });
    expect(verdict.sentence).toBe("350 of 500 readers (70%) reached an ending.");
    expect(verdict.severity).toBe("warning");
    expect(verdict.label).toBe("Partial Path Completion");

    const verdictSingular = buildVerdict({
      ok: true,
      runs: 1,
      outcomeCounts: { ended: 0, stuck: 1, stepLimit: 0, error: 0 },
    });
    expect(verdictSingular.sentence).toBe(
      "No reader finished your story. 0 of 1 reached an ending; all became stuck at scenes with unmet conditions."
    );
  });
});

describe("simulationPresentation helper: finding severity mapping (A10)", () => {
  it("maps every one of the 6 FindingKind values to exactly one severity", () => {
    const expectedKinds: FindingKind[] = [
      "stuck-spot",
      "ending-never-reached",
      "never-visited-but-reachable",
      "unreachable-confirmed",
      "loop-suspect",
      "edge-never-available",
    ];

    expect(ALL_FINDING_KINDS).toHaveLength(6);
    for (const kind of expectedKinds) {
      expect(ALL_FINDING_KINDS).toContain(kind);
      const severity = getFindingSeverity(kind);
      expect(["high", "medium", "low"]).toContain(severity);
    }

    // Specific assigned tiers
    expect(getFindingSeverity("stuck-spot")).toBe("high");
    expect(getFindingSeverity("ending-never-reached")).toBe("high");
    expect(getFindingSeverity("never-visited-but-reachable")).toBe("medium");
    expect(getFindingSeverity("unreachable-confirmed")).toBe("medium");
    expect(getFindingSeverity("loop-suspect")).toBe("medium");
    expect(getFindingSeverity("edge-never-available")).toBe("low");
  });

  it("groups findings by severity while strictly preserving crossCheck order inside each group", () => {
    const mockFindings: readonly Finding[] = [
      { kind: "edge-never-available", message: "choice 1" },
      { kind: "stuck-spot", message: "stuck 1" },
      { kind: "loop-suspect", message: "loop 1" },
      { kind: "ending-never-reached", message: "ending 1" },
      { kind: "never-visited-but-reachable", message: "unvisited 1" },
      { kind: "stuck-spot", message: "stuck 2" },
    ];

    const grouped = groupFindingsBySeverity(mockFindings);
    expect(grouped.high).toHaveLength(3);
    const high0 = grouped.high[0];
    const high1 = grouped.high[1];
    const high2 = grouped.high[2];
    expect(high0?.message).toBe("stuck 1");
    expect(high1?.message).toBe("ending 1");
    expect(high2?.message).toBe("stuck 2");

    expect(grouped.medium).toHaveLength(2);
    const med0 = grouped.medium[0];
    const med1 = grouped.medium[1];
    expect(med0?.message).toBe("loop 1");
    expect(med1?.message).toBe("unvisited 1");

    expect(grouped.low).toHaveLength(1);
    const low0 = grouped.low[0];
    expect(low0?.message).toBe("choice 1");
  });
});

describe("simulationPresentation helper: outcome distribution percentages", () => {
  it("derives exact percentages that sum to 100", () => {
    const dist = computeOutcomeDistribution(500, {
      ended: 250,
      stuck: 150,
      stepLimit: 100,
      error: 0,
    });

    expect(dist.endedPct).toBe(50);
    expect(dist.stuckPct).toBe(30);
    expect(dist.stepLimitPct).toBe(20);
    expect(dist.endedPct + dist.stuckPct + dist.stepLimitPct).toBe(100);
  });
});
