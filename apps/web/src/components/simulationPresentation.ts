import type { Finding, FindingKind } from "../playtest/crossCheck.js";
import type { SimulationOutcomeCounts } from "../playtest/simulate.js";

export type VerdictSeverity = "success" | "warning" | "danger";

export interface VerdictResult {
  readonly sentence: string;
  readonly severity: VerdictSeverity;
  readonly label: string;
}

export type FindingSeverity = "high" | "medium" | "low";

export const ALL_FINDING_KINDS: readonly FindingKind[] = [
  "stuck-spot",
  "ending-never-reached",
  "never-visited-but-reachable",
  "unreachable-confirmed",
  "loop-suspect",
  "edge-never-available",
] as const;

export const FINDING_KIND_SEVERITY: Readonly<Record<FindingKind, FindingSeverity>> = {
  "stuck-spot": "high",
  "ending-never-reached": "high",
  "never-visited-but-reachable": "medium",
  "unreachable-confirmed": "medium",
  "loop-suspect": "medium",
  "edge-never-available": "low",
} as const;

export function getFindingSeverity(kind: FindingKind): FindingSeverity {
  return FINDING_KIND_SEVERITY[kind];
}

export function groupFindingsBySeverity(
  findings: readonly Finding[]
): Record<FindingSeverity, Finding[]> {
  const grouped: Record<FindingSeverity, Finding[]> = {
    high: [],
    medium: [],
    low: [],
  };

  for (const finding of findings) {
    const sev = getFindingSeverity(finding.kind);
    grouped[sev].push(finding);
  }

  return grouped;
}

export interface OutcomeDistribution {
  readonly ended: number;
  readonly stuck: number;
  readonly stepLimit: number;
  readonly endedPct: number;
  readonly stuckPct: number;
  readonly stepLimitPct: number;
}

export function computeOutcomeDistribution(
  runs: number,
  counts: SimulationOutcomeCounts
): OutcomeDistribution {
  if (runs <= 0) {
    return {
      ended: 0,
      stuck: 0,
      stepLimit: 0,
      endedPct: 0,
      stuckPct: 0,
      stepLimitPct: 0,
    };
  }

  const endedPct = Math.round((counts.ended / runs) * 100);
  const stuckPct = Math.round((counts.stuck / runs) * 100);
  // Guarantee percentages add up without rounding discrepancy against 100
  const stepLimitPct = Math.max(0, 100 - endedPct - stuckPct);

  return {
    ended: counts.ended,
    stuck: counts.stuck,
    stepLimit: counts.stepLimit,
    endedPct,
    stuckPct,
    stepLimitPct,
  };
}

export type VerdictInput =
  | { readonly ok: false; readonly error: "no-start-node" }
  | {
      readonly ok: true;
      readonly runs: number;
      readonly outcomeCounts: SimulationOutcomeCounts;
    };

export function buildVerdict(input: VerdictInput): VerdictResult {
  if (!input.ok) {
    return {
      sentence: "Cannot run simulation: story graph has no Start node.",
      severity: "danger",
      label: "Missing Start Node",
    };
  }

  const { runs, outcomeCounts } = input;
  const readerNoun = runs === 1 ? "reader" : "readers";
  const { ended, stuck, stepLimit } = outcomeCounts;

  if (ended === runs) {
    return {
      sentence: `All ${runs} ${readerNoun} reached a story ending.`,
      severity: "success",
      label: "All Endings Reached",
    };
  }

  if (ended === 0) {
    let suffix = "";
    if (stuck > 0 && stepLimit === 0) {
      suffix = "; all became stuck at scenes with unmet conditions.";
    } else if (stepLimit > 0 && stuck === 0) {
      suffix = "; all timed out in loops reaching the step limit.";
    } else if (stuck > 0 && stepLimit > 0) {
      suffix = "; playthroughs were stuck or timed out in loops.";
    }

    return {
      sentence: `No reader finished your story. 0 of ${runs} reached an ending${suffix}`,
      severity: "danger",
      label: "Zero Endings Reached",
    };
  }

  const endedPct = Math.round((ended / runs) * 100);
  return {
    sentence: `${ended} of ${runs} ${readerNoun} (${endedPct}%) reached an ending.`,
    severity: endedPct >= 50 ? "warning" : "danger",
    label: "Partial Path Completion",
  };
}
