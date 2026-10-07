import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Project } from "@repo/schema";
import { generateBenchmarkProject } from "../benchmark/generator.js";
import { simulate } from "./simulate.js";

// Helper to deep-freeze an object for snapshot safety
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

describe("simulate: unit tests on hand-built projects", () => {
  it("fails cleanly with no-start-node if no start node exists", () => {
    const project: Project = {
      id: "p_no_start",
      name: "No Start",
      nodes: [{ id: "n1", type: "scene", title: "Scene" }],
      edges: [],
      variables: [],
    };
    const res = simulate(project);
    expect(res).toEqual({ ok: false, error: "no-start-node" });
  });

  it("reports input clamping for out-of-range runs and maxSteps", () => {
    const project: Project = {
      id: "p_clamp",
      name: "Clamp Test",
      nodes: [
        { id: "s", type: "start", title: "Start" },
        { id: "e", type: "end", title: "End" },
      ],
      edges: [{ id: "e1", from: "s", to: "e" }],
      variables: [],
    };

    // runs > 5000 and maxSteps > 2000
    const resOver = simulate(project, { runs: 6000, maxSteps: 3000 });
    expect(resOver.ok).toBe(true);
    if (resOver.ok) {
      expect(resOver.runs).toBe(5000);
      expect(resOver.clamped).toContain("runs clamped to 5000");
      expect(resOver.clamped).toContain("maxSteps clamped to 2000");
    }

    // runs < 1 and maxSteps < 1
    const resUnder = simulate(project, { runs: 0, maxSteps: -5 });
    expect(resUnder.ok).toBe(true);
    if (resUnder.ok) {
      expect(resUnder.runs).toBe(1);
      expect(resUnder.clamped).toContain("runs clamped to 1");
      expect(resUnder.clamped).toContain("maxSteps clamped to 1");
    }
  });

  it("linear story always ends in the one end node", () => {
    const project: Project = {
      id: "p_linear",
      name: "Linear Story",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "scene1", type: "scene", title: "Scene 1" },
        { id: "end1", type: "end", title: "Ending" },
      ],
      edges: [
        { id: "e1", from: "start", to: "scene1" },
        { id: "e2", from: "scene1", to: "end1" },
      ],
      variables: [],
    };

    const res = simulate(project, { runs: 100, seed: 42 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.runs).toBe(100);
    expect(res.outcomeCounts.ended).toBe(100);
    expect(res.outcomeCounts.stuck).toBe(0);
    expect(res.outcomeCounts.stepLimit).toBe(0);
    expect(res.outcomeCounts.error).toBe(0);
    expect(res.endCounts.get("end1")).toBe(100);
    expect(res.neverVisited).toEqual([]);
    expect(res.neverTakenEdges).toEqual([]);
    expect(res.neverAvailableEdges).toEqual([]);
    expect(res.averageSteps).toBe(2);
    expect(res.longestRun).toBe(2);
  });

  it("two-way branch reaches both ends across 200 runs and counts add up to runs", () => {
    const project: Project = {
      id: "p_branch",
      name: "Branch Story",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "end_a", type: "end", title: "End A" },
        { id: "end_b", type: "end", title: "End B" },
      ],
      edges: [
        { id: "e_a", from: "start", to: "end_a" },
        { id: "e_b", from: "start", to: "end_b" },
      ],
      variables: [],
    };

    const res = simulate(project, { runs: 200, seed: 123 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const countA = res.endCounts.get("end_a") ?? 0;
    const countB = res.endCounts.get("end_b") ?? 0;
    expect(countA + countB).toBe(200);
    expect(countA).toBeGreaterThan(40);
    expect(countB).toBeGreaterThan(40);
    expect(res.outcomeCounts.ended).toBe(200);
    expect(res.neverVisited).toEqual([]);
  });

  it("node behind always-false condition is neverVisited and edge in neverAvailableEdges", () => {
    const project: Project = {
      id: "p_false",
      name: "False Branch",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "accessible", type: "end", title: "Accessible End" },
        { id: "locked", type: "end", title: "Locked End" },
      ],
      edges: [
        { id: "e_ok", from: "start", to: "accessible" },
        { id: "e_locked", from: "start", to: "locked", condition: "1 == 2" },
      ],
      variables: [],
    };

    const res = simulate(project, { runs: 50, seed: 99 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.neverVisited).toContain("locked");
    expect(res.neverAvailableEdges).toContain("e_locked");
    expect(res.neverTakenEdges).toContain("e_locked");
    expect(res.endCounts.get("accessible")).toBe(50);
    expect(res.endCounts.has("locked")).toBe(false);
  });

  it("dead end node appears in stuckCounts with session reason", () => {
    const project: Project = {
      id: "p_dead",
      name: "Dead End",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "cliff", type: "scene", title: "Cliff (Dead End)" },
      ],
      edges: [{ id: "e1", from: "start", to: "cliff" }],
      variables: [],
    };

    const res = simulate(project, { runs: 50, seed: 7 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.outcomeCounts.stuck).toBe(50);
    expect(res.stuckCounts.get("cliff")).toBe(50);
    expect(res.outcomeCounts.ended).toBe(0);
  });

  it("cycle with no exit yields step-limit runs", () => {
    const project: Project = {
      id: "p_loop",
      name: "Infinite Loop",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "loop_a", type: "scene", title: "Loop A" },
        { id: "loop_b", type: "scene", title: "Loop B" },
      ],
      edges: [
        { id: "e_in", from: "start", to: "loop_a" },
        { id: "e_ab", from: "loop_a", to: "loop_b" },
        { id: "e_ba", from: "loop_b", to: "loop_a" },
      ],
      variables: [],
    };

    const res = simulate(project, { runs: 20, maxSteps: 30, seed: 55 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.outcomeCounts.stepLimit).toBe(20);
    expect(res.stepLimitRuns).toBe(20);
    expect(res.longestRun).toBe(30);
  });

  it("cycle with an exit still terminates via random choice", () => {
    const project: Project = {
      id: "p_exit_loop",
      name: "Loop with Exit",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "end_node", type: "end", title: "End" },
      ],
      edges: [
        { id: "e_self", from: "start", to: "start" },
        { id: "e_exit", from: "start", to: "end_node" },
      ],
      variables: [],
    };

    const res = simulate(project, { runs: 100, maxSteps: 500, seed: 777 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // With 50% exit chance per step, 100 runs will all terminate well before 500 steps
    expect(res.outcomeCounts.ended).toBe(100);
    expect(res.stepLimitRuns).toBe(0);
  });

  it("counts node visits by distinct runs rather than total visits", () => {
    const project: Project = {
      id: "p_distinct_visits",
      name: "Distinct Visits Test",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "loop_node", type: "scene", title: "Loop" },
        { id: "end_node", type: "end", title: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "loop_node" },
        {
          id: "e_self",
          from: "loop_node",
          to: "loop_node",
          condition: "passes < 5",
          effects: ["passes += 1"],
        },
        {
          id: "e_exit",
          from: "loop_node",
          to: "end_node",
          condition: "passes >= 5",
        },
      ],
      variables: [{ id: "v1", name: "passes", type: "number", initial: 0 }],
    };

    const res = simulate(project, { runs: 1, maxSteps: 20, seed: 1 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // The single run visits loop_node 6 times (steps > 1), but distinct visit count must be 1 run
    expect(res.longestRun).toBeGreaterThan(1);
    expect(res.visitCounts.get("loop_node")).toBe(1);
    expect(res.visitCounts.get("start")).toBe(1);
    expect(res.visitCounts.get("end_node")).toBe(1);
  });

  it("operates safely over a deep-frozen project without mutating it", () => {
    const project: Project = {
      id: "p_frozen",
      name: "Frozen",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "mid", type: "scene", title: "Mid" },
        { id: "end", type: "end", title: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "mid", effects: ["score += 10"] },
        { id: "e2", from: "mid", to: "end" },
      ],
      variables: [{ id: "v1", name: "score", type: "number", initial: 0 }],
    };

    deepFreeze(project);
    expect(() => simulate(project, { runs: 20, seed: 101 })).not.toThrow();
  });

  it("Property S2: fixed seed gives identical report, different seed may differ", () => {
    const project: Project = {
      id: "p_s2",
      name: "S2 Replay",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "branch1", type: "end", title: "End 1" },
        { id: "branch2", type: "end", title: "End 2" },
      ],
      edges: [
        { id: "e1", from: "start", to: "branch1" },
        { id: "e2", from: "start", to: "branch2" },
      ],
      variables: [],
    };

    const r1 = simulate(project, { runs: 100, seed: 12345 });
    const r2 = simulate(project, { runs: 100, seed: 12345 });
    expect(r1).toEqual(r2);

    const r3 = simulate(project, { runs: 100, seed: 99999 });
    expect(r3.ok).toBe(true);
  });
});

describe("Property S1: Generator projects traversal invariants", () => {
  it("counts sum to runs, visited ids exist, and neverVisited is disjoint", () => {
    let totalSimRuns = 0;
    let totalEnded = 0;
    let totalStuck = 0;
    let totalStepLimit = 0;
    let totalErrors = 0;

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.constantFrom(20, 50, 100),
        fc.constantFrom("none" as const, "planted" as const),
        (seed, nodeCount, defects) => {
          const project: Project =
            defects === "planted"
              ? generateBenchmarkProject({ seed, nodeCount, defects: "planted" }).project
              : generateBenchmarkProject({ seed, nodeCount, defects: "none" });

          const simRuns = 30;
          const res = simulate(project, {
            runs: simRuns,
            maxSteps: 100,
            seed: seed * 17,
          });

          expect(res.ok).toBe(true);
          if (!res.ok) return;

          totalSimRuns += res.runs;
          totalEnded += res.outcomeCounts.ended;
          totalStuck += res.outcomeCounts.stuck;
          totalStepLimit += res.outcomeCounts.stepLimit;
          totalErrors += res.outcomeCounts.error;

          // 1. Outcomes sum to runs
          const outcomeSum =
            res.outcomeCounts.ended +
            res.outcomeCounts.stuck +
            res.outcomeCounts.stepLimit +
            res.outcomeCounts.error;
          expect(outcomeSum).toBe(res.runs);

          // 2. sum(endCounts) + stuck + stepLimit + errors = runs
          let sumEndCounts = 0;
          for (const count of res.endCounts.values()) {
            sumEndCounts += count;
          }
          expect(
            sumEndCounts +
              res.outcomeCounts.stuck +
              res.outcomeCounts.stepLimit +
              res.outcomeCounts.error,
          ).toBe(res.runs);

          // 3. Every visited node id exists in project.nodes
          const validNodeIds = new Set(project.nodes.map((n) => n.id));
          for (const visitedId of res.visitCounts.keys()) {
            expect(validNodeIds.has(visitedId)).toBe(true);
          }

          // 4. Counts are non-negative
          for (const count of res.visitCounts.values()) {
            expect(count).toBeGreaterThanOrEqual(0);
          }
          for (const count of res.edgeTakenCounts.values()) {
            expect(count).toBeGreaterThanOrEqual(0);
          }

          // 5. neverVisited is disjoint from visited nodes
          for (const unvisitedId of res.neverVisited) {
            expect(res.visitCounts.has(unvisitedId)).toBe(false);
          }
        },
      ),
      { numRuns: 30 },
    );

    console.log(
      `[S1 DISTRIBUTION] total runs: ${totalSimRuns}, ended: ${totalEnded} (${((totalEnded / totalSimRuns) * 100).toFixed(1)}%), stuck: ${totalStuck} (${((totalStuck / totalSimRuns) * 100).toFixed(1)}%), stepLimit: ${totalStepLimit} (${((totalStepLimit / totalSimRuns) * 100).toFixed(1)}%), errors: ${totalErrors} (${((totalErrors / totalSimRuns) * 100).toFixed(1)}%)`,
    );
  });
});
