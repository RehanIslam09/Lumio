import type { Project } from "@repo/schema";
import {
  startSession,
  listChoices,
  choose,
  type SessionParseCache,
} from "./session.js";

export interface SimulateOptions {
  readonly seed?: number;
  readonly runs?: number;
  readonly maxSteps?: number;
  readonly startNodeId?: string;
}

export interface SimulationOutcomeCounts {
  readonly ended: number;
  readonly stuck: number;
  readonly stepLimit: number;
  readonly error: number;
}

export interface SimulationReport {
  readonly ok: true;
  readonly runs: number;
  readonly outcomeCounts: SimulationOutcomeCounts;
  readonly endCounts: ReadonlyMap<string, number>;
  readonly stuckCounts: ReadonlyMap<string, number>;
  readonly visitCounts: ReadonlyMap<string, number>;
  readonly edgeTakenCounts: ReadonlyMap<string, number>;
  readonly neverVisited: readonly string[];
  readonly neverTakenEdges: readonly string[];
  readonly neverAvailableEdges: readonly string[];
  readonly stepLimitRuns: number;
  readonly averageSteps: number;
  readonly longestRun: number;
  readonly startNodeId: string;
  readonly seed: number;
  readonly clamped: readonly string[];
  readonly confidenceNote: string;
}

export type SimulateResult =
  | SimulationReport
  | { readonly ok: false; readonly error: "no-start-node" };

/**
 * Inline mulberry32 PRNG (deterministic 32-bit generator).
 */
function createPrng(seed: number) {
  let a = seed >>> 0;
  function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function pick<T>(arr: readonly T[]): T | undefined {
    if (arr.length === 0) return undefined;
    const index = Math.floor(next() * arr.length);
    return arr[index];
  }
  return { next, pick };
}

const DEFAULT_RUNS = 500;
const MAX_RUNS = 5000;
const MIN_RUNS = 1;

const DEFAULT_MAX_STEPS = 200;
const MAX_MAX_STEPS = 2000;
const MIN_MAX_STEPS = 1;

/**
 * Pure simulation engine running deterministic Monte Carlo playthroughs.
 * Never mutates project. Never throws.
 */
export function simulate(
  project: Project,
  options?: SimulateOptions,
): SimulateResult {
  const clamped: string[] = [];

  // 1. Clamp runs
  let runs = options?.runs ?? DEFAULT_RUNS;
  if (runs > MAX_RUNS) {
    runs = MAX_RUNS;
    clamped.push(`runs clamped to ${MAX_RUNS}`);
  } else if (runs < MIN_RUNS) {
    runs = MIN_RUNS;
    clamped.push(`runs clamped to ${MIN_RUNS}`);
  }

  // 2. Clamp maxSteps
  let maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;
  if (maxSteps > MAX_MAX_STEPS) {
    maxSteps = MAX_MAX_STEPS;
    clamped.push(`maxSteps clamped to ${MAX_MAX_STEPS}`);
  } else if (maxSteps < MIN_MAX_STEPS) {
    maxSteps = MIN_MAX_STEPS;
    clamped.push(`maxSteps clamped to ${MIN_MAX_STEPS}`);
  }

  // 3. Seed & PRNG
  const seed = (options?.seed ?? 42) >>> 0;
  const prng = createPrng(seed);

  // 4. Shared parse cache across runs for efficiency
  const cache: SessionParseCache = {
    conditions: new Map(),
    effects: new Map(),
  };

  // Pre-flight startSession to confirm start node presence and get startNodeId
  const initialRes = startSession(project, {
    startNodeId: options?.startNodeId,
    cache,
  });
  if (!initialRes.ok) {
    return { ok: false, error: "no-start-node" };
  }
  const startNodeId = initialRes.session.startNodeId;

  // Aggregate structures
  let endedCount = 0;
  let stuckCount = 0;
  let stepLimitCount = 0;
  let errorCount = 0;

  const endCounts = new Map<string, number>();
  const stuckCounts = new Map<string, number>();
  const visitCounts = new Map<string, number>();
  const edgeTakenCounts = new Map<string, number>();
  const availableEdgesSeen = new Set<string>();

  let totalSteps = 0;
  let longestRun = 0;

  // 5. Run simulation loops
  for (let r = 0; r < runs; r++) {
    const runRes = startSession(project, {
      startNodeId: options?.startNodeId,
      cache,
    });
    if (!runRes.ok) {
      errorCount++;
      continue;
    }

    let session = runRes.session;
    const runVisited = new Set<string>([session.nodeId]);
    let stepsInRun = 0;

    while (session.status === "playing" && stepsInRun < maxSteps) {
      const choices = listChoices(session);
      for (const c of choices) {
        if (c.status === "available") {
          availableEdgesSeen.add(c.edgeId);
        }
      }

      const available = choices.filter((c) => c.status === "available");
      if (available.length === 0) {
        break;
      }

      const chosen = prng.pick(available);
      if (!chosen) {
        break;
      }

      edgeTakenCounts.set(
        chosen.edgeId,
        (edgeTakenCounts.get(chosen.edgeId) ?? 0) + 1,
      );

      const chooseRes = choose(session, chosen.edgeId);
      if (!chooseRes.ok) {
        // Engine error during choice
        session = {
          ...session,
          status: "error",
          message: chooseRes.error,
        };
        break;
      }

      session = chooseRes.session;
      stepsInRun++;
      runVisited.add(session.nodeId);
    }

    totalSteps += stepsInRun;
    if (stepsInRun > longestRun) {
      longestRun = stepsInRun;
    }

    // Accumulate distinct per-run visits
    for (const visitedNodeId of runVisited) {
      visitCounts.set(
        visitedNodeId,
        (visitCounts.get(visitedNodeId) ?? 0) + 1,
      );
    }

    // Classify run outcome
    if (session.status === "ended") {
      endedCount++;
      endCounts.set(session.nodeId, (endCounts.get(session.nodeId) ?? 0) + 1);
    } else if (session.status === "stuck") {
      stuckCount++;
      stuckCounts.set(
        session.nodeId,
        (stuckCounts.get(session.nodeId) ?? 0) + 1,
      );
    } else if (stepsInRun >= maxSteps) {
      stepLimitCount++;
    } else if (session.status === "error") {
      errorCount++;
    } else {
      // playing but broke early without choices
      stuckCount++;
      stuckCounts.set(
        session.nodeId,
        (stuckCounts.get(session.nodeId) ?? 0) + 1,
      );
    }
  }

  // 6. Post-process unvisited and untaken elements in project order
  const neverVisited = project.nodes
    .filter((n) => !visitCounts.has(n.id) || visitCounts.get(n.id) === 0)
    .map((n) => n.id);

  const neverTakenEdges = project.edges
    .filter((e) => !edgeTakenCounts.has(e.id) || edgeTakenCounts.get(e.id) === 0)
    .map((e) => e.id);

  const neverAvailableEdges = project.edges
    .filter((e) => !availableEdgesSeen.has(e.id))
    .map((e) => e.id);

  const averageSteps = runs > 0 ? Number((totalSteps / runs).toFixed(2)) : 0;

  // 7. Honesty confidence note
  let minVisits = runs;
  for (const count of visitCounts.values()) {
    if (count > 0 && count < minVisits) {
      minVisits = count;
    }
  }
  const minVisitPct = runs > 0 ? ((minVisits / runs) * 100).toFixed(1) : "0.0";
  const confidenceNote =
    `Simulation completed ${runs} runs (seed ${seed}). Smallest observed visit frequency among visited nodes: ${minVisitPct}%. ` +
    `Note: Random simulation confirms reachable paths; it cannot prove unreached nodes are unreachable.`;

  return {
    ok: true,
    runs,
    outcomeCounts: {
      ended: endedCount,
      stuck: stuckCount,
      stepLimit: stepLimitCount,
      error: errorCount,
    },
    endCounts,
    stuckCounts,
    visitCounts,
    edgeTakenCounts,
    neverVisited,
    neverTakenEdges,
    neverAvailableEdges,
    stepLimitRuns: stepLimitCount,
    averageSteps,
    longestRun,
    startNodeId,
    seed,
    clamped,
    confidenceNote,
  };
}
