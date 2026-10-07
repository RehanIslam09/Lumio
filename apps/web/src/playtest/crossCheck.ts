import type { Project } from "@repo/schema";
import type { SimulationReport } from "./simulate.js";

export type FindingKind =
  | "never-visited-but-reachable"
  | "unreachable-confirmed"
  | "ending-never-reached"
  | "edge-never-available"
  | "stuck-spot"
  | "loop-suspect";

export interface Finding {
  readonly kind: FindingKind;
  readonly nodeId?: string;
  readonly edgeId?: string;
  readonly message: string;
}

/**
 * Computes structurally reachable nodes from startNodeId using breadth-first search.
 * Ignores conditions completely to determine pure topological reachability.
 * Independent BFS implementation: does NOT import or invoke @repo/checker.
 */
function computeStaticReachableNodeIds(
  project: Project,
  startNodeId: string,
): ReadonlySet<string> {
  const reachable = new Set<string>();
  const validNodeIds = new Set(project.nodes.map((n) => n.id));

  if (!validNodeIds.has(startNodeId)) {
    return reachable;
  }

  const queue: string[] = [startNodeId];
  reachable.add(startNodeId);

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) break;

    for (const edge of project.edges) {
      if (edge.from === currentId && validNodeIds.has(edge.to)) {
        if (!reachable.has(edge.to)) {
          reachable.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
  }

  return reachable;
}

/**
 * Cross-checks dynamic simulation coverage against static graph topology.
 * Produces ordered findings classifying unreachable, blocked, stuck, and looping spots.
 * Never throws.
 */
export function crossCheck(
  project: Project,
  report: SimulationReport,
): readonly Finding[] {
  const findings: Finding[] = [];
  const reachable = computeStaticReachableNodeIds(project, report.startNodeId);
  const neverVisitedSet = new Set(report.neverVisited);
  const neverAvailableSet = new Set(report.neverAvailableEdges);

  // 1. 'never-visited-but-reachable' (project.nodes order)
  for (const node of project.nodes) {
    if (reachable.has(node.id) && neverVisitedSet.has(node.id)) {
      findings.push({
        kind: "never-visited-but-reachable",
        nodeId: node.id,
        message: `Node "${node.title}" (${node.id}) was never reached in simulation despite being structurally connected.`,
      });
    }
  }

  // 2. 'unreachable-confirmed' (project.nodes order)
  for (const node of project.nodes) {
    if (!reachable.has(node.id) && neverVisitedSet.has(node.id)) {
      findings.push({
        kind: "unreachable-confirmed",
        nodeId: node.id,
        message: `Node "${node.title}" (${node.id}) is structurally unreachable from the start node and was never visited.`,
      });
    }
  }

  // 3. 'ending-never-reached' (project.nodes order)
  for (const node of project.nodes) {
    if (node.type === "end" && reachable.has(node.id)) {
      const reachedCount = report.endCounts.get(node.id) ?? 0;
      if (reachedCount === 0) {
        findings.push({
          kind: "ending-never-reached",
          nodeId: node.id,
          message: `Ending "${node.title}" (${node.id}) was never reached in any simulation run.`,
        });
      }
    }
  }

  // 4. 'edge-never-available' (project.edges order)
  for (const edge of project.edges) {
    if (neverAvailableSet.has(edge.id)) {
      const sourceVisits = report.visitCounts.get(edge.from) ?? 0;
      if (sourceVisits > 0) {
        const sourceNode = project.nodes.find((n) => n.id === edge.from);
        const targetNode = project.nodes.find((n) => n.id === edge.to);
        const sourceTitle = sourceNode?.title ?? edge.from;
        const targetTitle = targetNode?.title ?? edge.to;
        findings.push({
          kind: "edge-never-available",
          edgeId: edge.id,
          message: `Choice leading to "${targetTitle}" from "${sourceTitle}" was never available in any simulation run.`,
        });
      }
    }
  }

  // 5. 'stuck-spot' (project.nodes order)
  for (const node of project.nodes) {
    const count = report.stuckCounts.get(node.id) ?? 0;
    if (count > 0) {
      findings.push({
        kind: "stuck-spot",
        nodeId: node.id,
        message: `Simulation got stuck at "${node.title}" (${node.id}) in ${count} run(s).`,
      });
    }
  }

  // 6. 'loop-suspect' (single finding if stepLimitRuns > 0)
  if (report.stepLimitRuns > 0) {
    findings.push({
      kind: "loop-suspect",
      message: `Potential infinite loop: ${report.stepLimitRuns} run(s) reached the maximum step limit (${report.longestRun} steps).`,
    });
  }

  return findings;
}
