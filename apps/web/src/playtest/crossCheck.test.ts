import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Project } from "@repo/schema";
import { generateBenchmarkProject } from "../benchmark/generator.js";
import { sampleProject } from "../demo/sampleProject.js";
import { simulate } from "./simulate.js";
import { crossCheck, type FindingKind } from "./crossCheck.js";

describe("crossCheck: unit tests on hand-crafted projects", () => {
  it("detects never-visited-but-reachable and ending-never-reached when path is blocked by condition", () => {
    const project: Project = {
      id: "p_blocked",
      name: "Blocked Branch",
      nodes: [
        { id: "start", type: "start", title: "Start Node" },
        { id: "alt_end", type: "end", title: "Open Ending" },
        { id: "mid", type: "scene", title: "Secret Scene" },
        { id: "secret_end", type: "end", title: "Secret Ending" },
      ],
      edges: [
        { id: "e_open", from: "start", to: "alt_end" },
        { id: "e_blocked", from: "start", to: "mid", condition: "1 == 2" },
        { id: "e_to_secret", from: "mid", to: "secret_end" },
      ],
      variables: [],
    };

    const simRes = simulate(project, { runs: 50, seed: 1 });
    expect(simRes.ok).toBe(true);
    if (!simRes.ok) return;

    const findings = crossCheck(project, simRes);

    const kinds = findings.map((f) => f.kind);
    expect(kinds).toContain<FindingKind>("never-visited-but-reachable");
    expect(kinds).toContain<FindingKind>("ending-never-reached");
    expect(kinds).toContain<FindingKind>("edge-never-available");

    const neverVisitedReachable = findings.filter(
      (f) => f.kind === "never-visited-but-reachable",
    );
    expect(neverVisitedReachable.map((f) => f.nodeId)).toContain("mid");
    expect(neverVisitedReachable.map((f) => f.nodeId)).toContain("secret_end");

    const endingNeverReached = findings.filter(
      (f) => f.kind === "ending-never-reached",
    );
    expect(endingNeverReached.map((f) => f.nodeId)).toContain("secret_end");

    const edgeNeverAvail = findings.filter((f) => f.kind === "edge-never-available");
    expect(edgeNeverAvail.map((f) => f.edgeId)).toContain("e_blocked");
  });

  it("detects unreachable-confirmed for structurally isolated nodes", () => {
    const project: Project = {
      id: "p_unreach",
      name: "Unreachable Island",
      nodes: [
        { id: "start", type: "start", title: "Start Node" },
        { id: "end_main", type: "end", title: "Main Ending" },
        { id: "island", type: "scene", title: "Nameless Island" },
      ],
      edges: [{ id: "e1", from: "start", to: "end_main" }],
      variables: [],
    };

    const simRes = simulate(project, { runs: 20, seed: 1 });
    expect(simRes.ok).toBe(true);
    if (!simRes.ok) return;

    const findings = crossCheck(project, simRes);
    const unreachableFindings = findings.filter(
      (f) => f.kind === "unreachable-confirmed",
    );
    expect(unreachableFindings.length).toBe(1);
    expect(unreachableFindings[0]?.nodeId).toBe("island");
    expect(unreachableFindings[0]?.message).toContain("Nameless Island");
  });

  it("detects stuck-spot for dead-end nodes", () => {
    const project: Project = {
      id: "p_stuck",
      name: "Stuck Test",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "dead", type: "scene", title: "Dead Precipice" },
      ],
      edges: [{ id: "e1", from: "start", to: "dead" }],
      variables: [],
    };

    const simRes = simulate(project, { runs: 20, seed: 1 });
    expect(simRes.ok).toBe(true);
    if (!simRes.ok) return;

    const findings = crossCheck(project, simRes);
    const stuckFindings = findings.filter((f) => f.kind === "stuck-spot");
    expect(stuckFindings.length).toBe(1);
    expect(stuckFindings[0]?.nodeId).toBe("dead");
    expect(stuckFindings[0]?.message).toContain("Dead Precipice");
  });

  it("detects loop-suspect when runs hit step-limit", () => {
    const project: Project = {
      id: "p_loop",
      name: "Loop Test",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "a", type: "scene", title: "Room A" },
        { id: "b", type: "scene", title: "Room B" },
      ],
      edges: [
        { id: "e1", from: "start", to: "a" },
        { id: "e2", from: "a", to: "b" },
        { id: "e3", from: "b", to: "a" },
      ],
      variables: [],
    };

    const simRes = simulate(project, { runs: 10, maxSteps: 20, seed: 1 });
    expect(simRes.ok).toBe(true);
    if (!simRes.ok) return;

    const findings = crossCheck(project, simRes);
    const loopFindings = findings.filter((f) => f.kind === "loop-suspect");
    expect(loopFindings.length).toBe(1);
    expect(loopFindings[0]?.message).toContain("10");
  });

  it("orders findings strictly by kind hierarchy and then project order", () => {
    const project: Project = {
      id: "p_order",
      name: "Order Test",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "n_stuck", type: "scene", title: "Stuck Node" },
        { id: "n_iso", type: "scene", title: "Isolated Node" },
        { id: "n_blocked", type: "scene", title: "Blocked Node" },
        { id: "n_end_never", type: "end", title: "Never Ending" },
      ],
      edges: [
        { id: "e_stuck", from: "start", to: "n_stuck" },
        { id: "e_blocked", from: "start", to: "n_blocked", condition: "1 == 2" },
        { id: "e_to_end", from: "n_blocked", to: "n_end_never" },
      ],
      variables: [],
    };

    const simRes = simulate(project, { runs: 30, seed: 1 });
    expect(simRes.ok).toBe(true);
    if (!simRes.ok) return;

    const findings = crossCheck(project, simRes);
    const kindOrderMap: Record<FindingKind, number> = {
      "never-visited-but-reachable": 1,
      "unreachable-confirmed": 2,
      "ending-never-reached": 3,
      "edge-never-available": 4,
      "stuck-spot": 5,
      "loop-suspect": 6,
    };

    for (let i = 0; i < findings.length - 1; i++) {
      const cur = findings[i];
      const next = findings[i + 1];
      if (cur && next) {
        expect(kindOrderMap[cur.kind]).toBeLessThanOrEqual(kindOrderMap[next.kind]);
      }
    }
  });

  it("finds expected defects on sampleProject", () => {
    const simRes = simulate(sampleProject, { runs: 200, seed: 42 });
    expect(simRes.ok).toBe(true);
    if (!simRes.ok) return;

    const findings = crossCheck(sampleProject, simRes);

    // 1. Stuck spots: stormterror approach (blocked outgoing choice due to undefined variable abyssal_tear)
    const stuckNodes = findings
      .filter((f) => f.kind === "stuck-spot")
      .map((f) => f.nodeId);
    expect(stuckNodes).toContain("node_stormterror_approach");

    // 2. Never visited but reachable: starsnatch cliff (behind uninitialized paimon_hungry)
    const neverVisitedReachable = findings
      .filter((f) => f.kind === "never-visited-but-reachable")
      .map((f) => f.nodeId);
    expect(neverVisitedReachable).toContain("node_starsnatch_cliff");

    // 2. Unreachable confirmed: nameless island
    const unreachableNodes = findings
      .filter((f) => f.kind === "unreachable-confirmed")
      .map((f) => f.nodeId);
    expect(unreachableNodes).toContain("node_nameless_island");

    // 3. Loop suspect: abyss cycle
    const loopFindings = findings.filter((f) => f.kind === "loop-suspect");
    expect(loopFindings.length).toBe(1);

    // 4. Edge never available: edge_approach_to_barrier (undefined var abyssal_tear)
    const neverAvailableEdges = findings
      .filter((f) => f.kind === "edge-never-available")
      .map((f) => f.edgeId);
    expect(neverAvailableEdges).toContain("edge_approach_to_barrier");
  });
});

describe("Property S3: crossCheck never throws and cites valid entities", () => {
  it("evaluates cleanly on arbitrary generator projects", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.constantFrom(20, 50),
        fc.constantFrom("none" as const, "planted" as const),
        (seed, nodeCount, defects) => {
          const project: Project =
            defects === "planted"
              ? generateBenchmarkProject({ seed, nodeCount, defects: "planted" }).project
              : generateBenchmarkProject({ seed, nodeCount, defects: "none" });

          const simRes = simulate(project, { runs: 20, maxSteps: 50, seed: seed * 3 });
          if (!simRes.ok) return;

          const findings = crossCheck(project, simRes);
          expect(Array.isArray(findings)).toBe(true);

          const validNodeIds = new Set(project.nodes.map((n) => n.id));
          const validEdgeIds = new Set(project.edges.map((e) => e.id));

          for (const f of findings) {
            if (f.nodeId !== undefined) {
              expect(validNodeIds.has(f.nodeId)).toBe(true);
            }
            if (f.edgeId !== undefined) {
              expect(validEdgeIds.has(f.edgeId)).toBe(true);
            }
            expect(typeof f.message).toBe("string");
            expect(f.message.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});
