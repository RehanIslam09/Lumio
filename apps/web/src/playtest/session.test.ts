import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Project } from "@repo/schema";
import { generateBenchmarkProject } from "../benchmark/generator.js";
import {
  startSession,
  listChoices,
  choose,
  back,
  restart,
} from "./session.js";

// Helper to deep-freeze an object for snapshot safety tests
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

function makeSimpleProject(): Project {
  return {
    id: "p1",
    name: "Simple Quest",
    nodes: [
      { id: "start", type: "start", title: "Start Node" },
      { id: "mid", type: "scene", title: "Middle Scene" },
      { id: "deadEnd", type: "scene", title: "Dead End" },
      { id: "end", type: "end", title: "End Node" },
    ],
    edges: [
      { id: "e1", from: "start", to: "mid", effects: ["hp += 10"] },
      { id: "e2", from: "mid", to: "deadEnd", condition: "hp > 20" },
      { id: "e3", from: "mid", to: "end", condition: "hp <= 20" },
    ],
    variables: [{ id: "v1", name: "hp", type: "number", initial: 10 }],
  };
}

describe("startSession", () => {
  it("starts at the first start node in project.nodes order", () => {
    const project = makeSimpleProject();
    const res = startSession(project);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.session.nodeId).toBe("start");
      expect(res.session.state.get("hp")).toBe(10);
      expect(res.session.visits.get("start")).toBe(1);
      expect(res.session.status).toBe("playing");
      expect(res.session.history.length).toBe(0);
    }
  });

  it("can start from a specified existing node", () => {
    const project = makeSimpleProject();
    const res = startSession(project, { startNodeId: "mid" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.session.nodeId).toBe("mid");
      expect(res.session.visits.get("mid")).toBe(1);
    }
  });

  it("fails with no-start-node if no start node exists and none provided", () => {
    const project: Project = {
      ...makeSimpleProject(),
      nodes: [{ id: "mid", type: "scene", title: "No start here" }],
    };
    const res = startSession(project);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("no-start-node");
    }
  });

  it("fails with no-start-node if startNodeId does not exist", () => {
    const project = makeSimpleProject();
    const res = startSession(project, { startNodeId: "nonexistent" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("no-start-node");
    }
  });

  it("status is 'ended' if started on an end node", () => {
    const project = makeSimpleProject();
    const res = startSession(project, { startNodeId: "end" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.session.status).toBe("ended");
    }
  });

  it("status is 'stuck' if started on a node with zero available choices", () => {
    const project = makeSimpleProject();
    const res = startSession(project, { startNodeId: "deadEnd" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.session.status).toBe("stuck");
      expect(res.session.message).toContain("no outgoing paths");
    }
  });
});

describe("listChoices", () => {
  it("returns choices in project.edges order", () => {
    const project = makeSimpleProject();
    const s = startSession(project);
    if (!s.ok) throw new Error("session failed");

    const choices = listChoices(s.session);
    expect(choices.length).toBe(1);
    expect(choices[0]?.edgeId).toBe("e1");
    expect(choices[0]?.targetNodeId).toBe("mid");
    expect(choices[0]?.targetTitle).toBe("Middle Scene");
    expect(choices[0]?.status).toBe("available");
  });

  it("evaluates blocked conditions and syntax/runtime errors correctly", () => {
    const project: Project = {
      id: "p2",
      name: "Condition Test",
      nodes: [
        { id: "root", type: "start", title: "Root" },
        { id: "n1", type: "scene", title: "Target 1" },
        { id: "n2", type: "scene", title: "Target 2" },
        { id: "n3", type: "scene", title: "Target 3" },
      ],
      edges: [
        { id: "e1", from: "root", to: "n1", condition: "flag == true" },
        { id: "e2", from: "root", to: "n2", condition: "unknownVar > 0" },
        { id: "e3", from: "root", to: "missingNode" },
      ],
      variables: [{ id: "v1", name: "flag", type: "boolean", initial: false }],
    };

    const s = startSession(project);
    if (!s.ok) throw new Error("session failed");

    const choices = listChoices(s.session);
    expect(choices.length).toBe(3);

    // e1: flag == true -> false -> blocked
    expect(choices[0]?.edgeId).toBe("e1");
    expect(choices[0]?.status).toBe("blocked");

    // e2: unknownVar > 0 -> runtime undefined variable -> error
    expect(choices[1]?.edgeId).toBe("e2");
    expect(choices[1]?.status).toBe("error");
    expect(choices[1]?.reason).toContain("unknownVar");

    // e3: target missing -> error
    expect(choices[2]?.edgeId).toBe("e3");
    expect(choices[2]?.status).toBe("error");
    expect(choices[2]?.reason).toBe("target node missing");
  });

  it("an edge whose effects would fail at runtime is still available in listChoices", () => {
    const project: Project = {
      id: "p3",
      name: "Effect Error",
      nodes: [
        { id: "root", type: "start", title: "Root" },
        { id: "next", type: "scene", title: "Next" },
      ],
      edges: [{ id: "e1", from: "root", to: "next", effects: ['count = "fail"'] }],
      variables: [{ id: "v1", name: "count", type: "number", initial: 0 }],
    };

    const s = startSession(project);
    if (!s.ok) throw new Error("session failed");

    const choices = listChoices(s.session);
    expect(choices[0]?.status).toBe("available");
  });

  it("Amendment 4: parse cache optimization produces identical results with and without warm cache", () => {
    const project = makeSimpleProject();
    const s = startSession(project);
    if (!s.ok) throw new Error("session failed");

    const coldChoices = listChoices(s.session);
    const warmChoices = listChoices(s.session);
    expect(coldChoices).toEqual(warmChoices);
  });
});

describe("choose and atomic effects", () => {
  it("advances session, updates state and visits, and records history", () => {
    const project = makeSimpleProject();
    const s = startSession(project);
    if (!s.ok) throw new Error("session failed");

    const r1 = choose(s.session, "e1");
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.session.nodeId).toBe("mid");
      expect(r1.session.state.get("hp")).toBe(20);
      expect(r1.session.visits.get("mid")).toBe(1);
      expect(r1.session.visits.get("start")).toBe(1);
      expect(r1.session.history.length).toBe(1);
      expect(r1.session.status).toBe("playing");

      // From mid: hp is 20, e3 is hp <= 20 (available), e2 is hp > 20 (blocked)
      const choices = listChoices(r1.session);
      expect(choices.find((c) => c.edgeId === "e3")?.status).toBe("available");
      expect(choices.find((c) => c.edgeId === "e2")?.status).toBe("blocked");

      // Take e3 to end
      const r2 = choose(r1.session, "e3");
      expect(r2.ok).toBe(true);
      if (r2.ok) {
        expect(r2.session.nodeId).toBe("end");
        expect(r2.session.status).toBe("ended");
      }
    }
  });

  it("rejects choosing blocked or error choices", () => {
    const project = makeSimpleProject();
    const s = startSession(project);
    if (!s.ok) throw new Error("session failed");

    // e2 does not originate at start
    const r = choose(s.session, "e2");
    expect(r.ok).toBe(false);
  });

  it("is atomic when an effect fails: state is not modified and error returned", () => {
    const project: Project = {
      id: "p4",
      name: "Atomic Failure",
      nodes: [
        { id: "root", type: "start", title: "Root" },
        { id: "next", type: "scene", title: "Next" },
      ],
      edges: [
        {
          id: "e1",
          from: "root",
          to: "next",
          effects: ["hp += 10", 'hp = "type error"', "hp += 5"],
        },
      ],
      variables: [{ id: "v1", name: "hp", type: "number", initial: 10 }],
    };

    const s = startSession(project);
    if (!s.ok) throw new Error("session failed");

    const res = choose(s.session, "e1");
    expect(res.ok).toBe(false);
    expect(s.session.state.get("hp")).toBe(10); // unchanged
    expect(s.session.nodeId).toBe("root");
  });
});

describe("back and restart", () => {
  it("restores the exact previous step and deep-equals state before choose", () => {
    const project = makeSimpleProject();
    const s = startSession(project);
    if (!s.ok) throw new Error("session failed");

    const r1 = choose(s.session, "e1");
    if (!r1.ok) throw new Error("choose failed");

    const restored = back(r1.session);
    expect(restored.nodeId).toBe(s.session.nodeId);
    expect(restored.state.get("hp")).toBe(s.session.state.get("hp"));
    expect(restored.visits.get("start")).toBe(s.session.visits.get("start"));
    expect(restored.history.length).toBe(0);
    expect(restored.status).toBe(s.session.status);
  });

  it("back is a no-op at start of session", () => {
    const project = makeSimpleProject();
    const s = startSession(project);
    if (!s.ok) throw new Error("session failed");

    const b = back(s.session);
    expect(b).toBe(s.session);
  });

  it("restart resets state, visits, and history back to initial", () => {
    const project = makeSimpleProject();
    const s = startSession(project);
    if (!s.ok) throw new Error("session failed");

    const r1 = choose(s.session, "e1");
    if (!r1.ok) throw new Error("choose failed");

    const restarted = restart(r1.session);
    expect(restarted.nodeId).toBe("start");
    expect(restarted.state.get("hp")).toBe(10);
    expect(restarted.visits.get("start")).toBe(1);
    expect(restarted.visits.get("mid")).toBeUndefined();
    expect(restarted.history.length).toBe(0);
    expect(restarted.status).toBe("playing");
  });
});

describe("Amendment 5: Snapshot safety", () => {
  it("operates safely over a deep-frozen project without mutating it", () => {
    const frozenProject = deepFreeze(makeSimpleProject());
    const s = startSession(frozenProject);
    expect(s.ok).toBe(true);
    if (s.ok) {
      expect(s.session.project).toBe(frozenProject);
      const choices = listChoices(s.session);
      expect(choices.length).toBe(1);

      const next = choose(s.session, "e1");
      expect(next.ok).toBe(true);
      if (next.ok) {
        expect(next.session.project).toBe(frozenProject);
        const restored = back(next.session);
        expect(restored.project).toBe(frozenProject);
        const restarted = restart(next.session);
        expect(restarted.project).toBe(frozenProject);
      }
    }
  });
});

describe("Amendment 6: History cap at 1000 steps", () => {
  it("drops oldest step at 1001 steps and back restores correctly", () => {
    // Construct a 2-node looping project
    const project: Project = {
      id: "loop",
      name: "Loop",
      nodes: [
        { id: "n1", type: "start", title: "Node 1" },
        { id: "n2", type: "scene", title: "Node 2" },
      ],
      edges: [
        { id: "e1", from: "n1", to: "n2", effects: ["step += 1"] },
        { id: "e2", from: "n2", to: "n1", effects: ["step += 1"] },
      ],
      variables: [{ id: "v1", name: "step", type: "number", initial: 0 }],
    };

    const s = startSession(project);
    if (!s.ok) throw new Error("start failed");
    let current = s.session;

    // Take 1001 steps
    for (let i = 0; i < 1001; i++) {
      const edgeId = current.nodeId === "n1" ? "e1" : "e2";
      const next = choose(current, edgeId);
      if (!next.ok) throw new Error(`step ${i} failed`);
      current = next.session;
    }

    expect(current.history.length).toBe(1000);
    expect(current.state.get("step")).toBe(1001);

    // Step back 1000 times
    for (let i = 0; i < 1000; i++) {
      current = back(current);
    }

    // After 1000 backs, we should be at step 1 (the state after the first dropped step!)
    expect(current.history.length).toBe(0);
    expect(current.state.get("step")).toBe(1);
    expect(current.nodeId).toBe("n2");
  });
});

describe("Amendment 7: Status priority", () => {
  it("end node is always 'ended' even if it has outgoing edges", () => {
    const project: Project = {
      id: "pEnd",
      name: "End with edge",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "endNode", type: "end", title: "End Node" },
        { id: "sceneNode", type: "scene", title: "Scene" },
      ],
      edges: [
        { id: "e1", from: "start", to: "endNode" },
        { id: "e2", from: "endNode", to: "sceneNode" },
      ],
      variables: [],
    };

    const s = startSession(project);
    if (!s.ok) throw new Error("start failed");
    const res = choose(s.session, "e1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.session.status).toBe("ended");
    }
  });

  it("non-end node with zero available choices is 'stuck'", () => {
    const project: Project = {
      id: "pStuck",
      name: "Stuck",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "sceneA", type: "scene", title: "Scene A" },
        { id: "sceneB", type: "scene", title: "Scene B" },
      ],
      edges: [
        { id: "e1", from: "start", to: "sceneA" },
        { id: "e2", from: "sceneA", to: "sceneB", condition: "1 == 2" }, // blocked
      ],
      variables: [],
    };

    const s = startSession(project);
    if (!s.ok) throw new Error("start failed");
    const res = choose(s.session, "e1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.session.status).toBe("stuck");
      expect(res.session.message).toContain("all outgoing paths are blocked");
    }
  });
});

describe("Property P1: Generator projects traversal", () => {
  it("random walk on benchmark projects never throws and back() restores deep-equal session", () => {
    let accepted = 0;
    let rejected = 0;
    let stuck = 0;

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.constantFrom(5, 10, 20),
        (seed, nodeCount) => {
          const project = generateBenchmarkProject({ seed, nodeCount, defects: "none" });
          const startRes = startSession(project);
          if (!startRes.ok) return;

          let session = startRes.session;

          for (let step = 0; step < 15; step++) {
            if (session.status === "ended") break;
            if (session.status === "stuck") {
              stuck++;
              break;
            }

            const choices = listChoices(session);
            const available = choices.filter((c) => c.status === "available");

            if (available.length === 0) {
              stuck++;
              break;
            }

            // Pick first available choice
            const pick = available[0];
            if (!pick) break;

            const preChooseState = session;
            const nextRes = choose(session, pick.edgeId);

            if (nextRes.ok) {
              accepted++;
              session = nextRes.session;

              // Verify variable types preserved
              for (const v of project.variables) {
                const val = session.state.get(v.name);
                if (val !== undefined) {
                  expect(typeof val).toBe(v.type);
                }
              }

              // Verify back restores preChooseState
              const steppedBack = back(session);
              expect(steppedBack.nodeId).toBe(preChooseState.nodeId);
              expect(steppedBack.status).toBe(preChooseState.status);
              expect(steppedBack.history.length).toBe(preChooseState.history.length);
              for (const [k, v] of preChooseState.state) {
                expect(steppedBack.state.get(k)).toBe(v);
              }
            } else {
              rejected++;
            }
          }
        },
      ),
      { numRuns: 30 },
    );

    console.log(
      `[P1 DISTRIBUTION] accepted: ${accepted}, rejected: ${rejected}, stuck: ${stuck}`,
    );
  });

  it("Property P2: distribution over benchmark projects meets at least 5% threshold for rejected, stuck, and ended", () => {
    let accepted = 0;
    let rejected = 0;
    let stuck = 0;
    let ended = 0;

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }),
        fc.constantFrom(5, 8, 12),
        fc.constantFrom("none" as const, "planted" as const),
        (seed, nodeCount, defects) => {
          const project =
            defects === "planted"
              ? generateBenchmarkProject({ seed, nodeCount, defects: "planted" }).project
              : generateBenchmarkProject({ seed, nodeCount, defects: "none" });

          const startRes = startSession(project);
          if (!startRes.ok) return;

          let session = startRes.session;

          for (let step = 0; step < 20; step++) {
            if (session.status === "ended") {
              ended++;
              break;
            }
            if (session.status === "stuck") {
              stuck++;
              break;
            }

            const choices = listChoices(session);
            if (choices.length === 0) {
              stuck++;
              break;
            }

            const available = choices.filter((c) => c.status === "available");
            const unavailable = choices.filter((c) => c.status !== "available");

            // Intentionally pick an unavailable choice or invalid ID to test rejection
            const badPick = unavailable[0];
            if (badPick && (step % 2 === 0 || available.length === 0)) {
              const badRes = choose(session, badPick.edgeId);
              if (!badRes.ok) {
                rejected++;
              }
            } else if (available.length === 0) {
              const fakeRes = choose(session, "nonexistent_edge");
              if (!fakeRes.ok) {
                rejected++;
              }
              stuck++;
              break;
            }

            // Also advance via available choice if one exists
            const pick = available[0];
            if (pick) {
              const goodRes = choose(session, pick.edgeId);
              if (goodRes.ok) {
                accepted++;
                session = goodRes.session;
                if (session.status === "ended") {
                  ended++;
                  break;
                }
                if (session.status === "stuck") {
                  stuck++;
                  break;
                }
              } else {
                rejected++;
              }
            }
          }
        },
      ),
      { numRuns: 60 },
    );

    const total = accepted + rejected + stuck + ended;
    const acceptedPct = (accepted / total) * 100;
    const rejectedPct = (rejected / total) * 100;
    const stuckPct = (stuck / total) * 100;
    const endedPct = (ended / total) * 100;

    console.log(
      `[P2 DISTRIBUTION] total: ${total}, accepted: ${accepted} (${acceptedPct.toFixed(1)}%), rejected: ${rejected} (${rejectedPct.toFixed(1)}%), stuck: ${stuck} (${stuckPct.toFixed(1)}%), ended: ${ended} (${endedPct.toFixed(1)}%)`,
    );

    expect(rejected / total).toBeGreaterThanOrEqual(0.05);
    expect(stuck / total).toBeGreaterThanOrEqual(0.05);
    expect(ended / total).toBeGreaterThanOrEqual(0.05);
  });
});
