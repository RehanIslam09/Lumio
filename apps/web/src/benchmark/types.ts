import type { IssueRuleId, Project } from "@repo/schema";

export interface BenchmarkOptions {
  seed: number;
  nodeCount: number;
  castSize?: number;
  endingCount?: number;
  variableCount?: number;
  defects?: "none" | "planted";
}

export interface PlantedDefect {
  kind: IssueRuleId;
  nodeId: string;
}

export interface BenchmarkWithDefectsResult {
  project: Project;
  defects: PlantedDefect[];
}
