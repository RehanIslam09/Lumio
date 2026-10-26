import type {
  Project,
  FlowNode,
  FlowNodeType,
  FlowEdge,
  Variable,
  VariableType,
  Entity,
  EntityKind,
} from "@repo/schema";

export type ChangeType = "added" | "removed" | "modified" | "unchanged";

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
}

/**
 * Pure, deterministic line-by-line diff using Longest Common Subsequence (LCS).
 */
export function computeLineDiff(
  textA: string | null | undefined,
  textB: string | null | undefined,
): DiffLine[] {
  const strA = textA ?? "";
  const strB = textB ?? "";

  if (strA === "" && strB === "") {
    return [];
  }

  if (strA === strB) {
    return strA.split("\n").map((text) => ({ type: "unchanged", text }));
  }

  const linesA = strA !== "" ? strA.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n") : [];
  const linesB = strB !== "" ? strB.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n") : [];

  const m = linesA.length;
  const n = linesB.length;

  // LCS dynamic programming table (flat Int32Array for safety and performance)
  const dp = new Int32Array((m + 1) * (n + 1));
  const getDp = (r: number, c: number): number => dp[r * (n + 1) + c] ?? 0;
  const setDp = (r: number, c: number, val: number): void => {
    dp[r * (n + 1) + c] = val;
  };

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const lineA = linesA[i - 1] ?? "";
      const lineB = linesB[j - 1] ?? "";
      if (lineA === lineB) {
        setDp(i, j, getDp(i - 1, j - 1) + 1);
      } else {
        setDp(i, j, Math.max(getDp(i - 1, j), getDp(i, j - 1)));
      }
    }
  }

  // Backtrack to construct diff lines
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    const lineA = i > 0 ? (linesA[i - 1] ?? "") : "";
    const lineB = j > 0 ? (linesB[j - 1] ?? "") : "";

    if (i > 0 && j > 0 && lineA === lineB) {
      result.push({ type: "unchanged", text: lineA });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || getDp(i, j - 1) >= getDp(i - 1, j))) {
      result.push({ type: "added", text: lineB });
      j--;
    } else if (i > 0) {
      result.push({ type: "removed", text: lineA });
      i--;
    }
  }

  result.reverse();
  return result;
}

export interface NodeDiff {
  id: string;
  type: ChangeType;
  title: { from?: string; to?: string; changed: boolean };
  nodeType: { from?: FlowNodeType; to?: FlowNodeType; changed: boolean };
  speakerId: { from?: string | null; to?: string | null; changed: boolean };
  body: {
    from?: string | null;
    to?: string | null;
    changed: boolean;
    lines?: DiffLine[];
  };
  position: {
    from?: { x: number; y: number } | null;
    to?: { x: number; y: number } | null;
    changed: boolean;
  };
  hasNarrativeChange: boolean;
  hasLayoutChange: boolean;
}

export interface EdgeDiff {
  id: string;
  type: ChangeType;
  from: { from?: string; to?: string; changed: boolean };
  to: { from?: string; to?: string; changed: boolean };
  condition: { from?: string | null; to?: string | null; changed: boolean };
  effects: { from?: string[]; to?: string[]; changed: boolean };
  hasNarrativeChange: boolean;
  hasStructuralChange: boolean;
}

export interface EntityDiff {
  id: string;
  type: ChangeType;
  name: { from?: string; to?: string; changed: boolean };
  kind: { from?: EntityKind; to?: EntityKind; changed: boolean };
  description: { from?: string | null; to?: string | null; changed: boolean };
  hasNarrativeChange: boolean;
}

export interface VariableDiff {
  id: string;
  type: ChangeType;
  name: { from?: string; to?: string; changed: boolean };
  varType: { from?: VariableType; to?: VariableType; changed: boolean };
  initial: { from?: unknown; to?: unknown; changed: boolean };
  hasNarrativeChange: boolean;
}

export interface ProjectDiffSummary {
  totalChanges: number;
  narrativeChanges: number;
  structuralChanges: number;
  layoutChanges: number;
  nodesAdded: number;
  nodesRemoved: number;
  nodesModified: number;
  edgesAdded: number;
  edgesRemoved: number;
  edgesModified: number;
  entitiesAdded: number;
  entitiesRemoved: number;
  entitiesModified: number;
  variablesAdded: number;
  variablesRemoved: number;
  variablesModified: number;
  nameChanged: boolean;
}

export interface ProjectDiff {
  summary: ProjectDiffSummary;
  projectName: { from: string; to: string; changed: boolean };
  nodes: NodeDiff[];
  edges: EdgeDiff[];
  entities: EntityDiff[];
  variables: VariableDiff[];
}

function positionsEqual(
  a?: { x: number; y: number } | null,
  b?: { x: number; y: number } | null,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y;
}

function effectsEqual(a?: string[] | null, b?: string[] | null): boolean {
  const arrA = a ?? [];
  const arrB = b ?? [];
  if (arrA.length !== arrB.length) return false;
  return arrA.every((val, idx) => val === arrB[idx]);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || a === null) return b === undefined || b === null;
  return false;
}

/**
 * Pure, deterministic project comparison function.
 * Matches elements by stable ID, classifies changes, and calculates line diffs.
 */
export function compareProjects(projectA: Project, projectB: Project): ProjectDiff {
  // 1. Project name
  const nameChanged = projectA.name !== projectB.name;
  const projectName = {
    from: projectA.name,
    to: projectB.name,
    changed: nameChanged,
  };

  // 2. Nodes
  const nodesA = new Map<string, FlowNode>();
  for (const n of projectA.nodes) nodesA.set(n.id, n);

  const nodesB = new Map<string, FlowNode>();
  for (const n of projectB.nodes) nodesB.set(n.id, n);

  const allNodeIds = Array.from(new Set([...nodesA.keys(), ...nodesB.keys()]));
  // Deterministic sort: by title then by ID
  allNodeIds.sort((id1, id2) => {
    const t1 = (nodesB.get(id1)?.title ?? nodesA.get(id1)?.title ?? "").toLowerCase();
    const t2 = (nodesB.get(id2)?.title ?? nodesA.get(id2)?.title ?? "").toLowerCase();
    const cmp = t1.localeCompare(t2);
    return cmp !== 0 ? cmp : id1.localeCompare(id2);
  });

  const nodeDiffs: NodeDiff[] = [];
  let nodesAdded = 0;
  let nodesRemoved = 0;
  let nodesModified = 0;

  for (const id of allNodeIds) {
    const nA = nodesA.get(id);
    const nB = nodesB.get(id);

    if (!nA && nB) {
      // Added
      nodesAdded++;
      nodeDiffs.push({
        id,
        type: "added",
        title: { to: nB.title, changed: true },
        nodeType: { to: nB.type, changed: true },
        speakerId: { to: nB.speakerId, changed: nB.speakerId !== undefined },
        body: {
          to: nB.body,
          changed: nB.body !== undefined,
          lines: nB.body ? computeLineDiff("", nB.body) : undefined,
        },
        position: { to: nB.position, changed: nB.position !== undefined },
        hasNarrativeChange: true,
        hasLayoutChange: nB.position !== undefined,
      });
    } else if (nA && !nB) {
      // Removed
      nodesRemoved++;
      nodeDiffs.push({
        id,
        type: "removed",
        title: { from: nA.title, changed: true },
        nodeType: { from: nA.type, changed: true },
        speakerId: { from: nA.speakerId, changed: nA.speakerId !== undefined },
        body: {
          from: nA.body,
          changed: nA.body !== undefined,
          lines: nA.body ? computeLineDiff(nA.body, "") : undefined,
        },
        position: { from: nA.position, changed: nA.position !== undefined },
        hasNarrativeChange: true,
        hasLayoutChange: nA.position !== undefined,
      });
    } else if (nA && nB) {
      // Both exist: check modifications
      const titleChanged = nA.title !== nB.title;
      const typeChanged = nA.type !== nB.type;
      const speakerChanged = (nA.speakerId ?? null) !== (nB.speakerId ?? null);
      const bodyChanged = (nA.body ?? null) !== (nB.body ?? null);
      const positionChanged = !positionsEqual(nA.position, nB.position);

      const hasNarrativeChange = titleChanged || typeChanged || speakerChanged || bodyChanged;
      const hasLayoutChange = positionChanged;
      const isModified = hasNarrativeChange || hasLayoutChange;

      if (isModified) {
        nodesModified++;
      }

      nodeDiffs.push({
        id,
        type: isModified ? "modified" : "unchanged",
        title: { from: nA.title, to: nB.title, changed: titleChanged },
        nodeType: { from: nA.type, to: nB.type, changed: typeChanged },
        speakerId: { from: nA.speakerId, to: nB.speakerId, changed: speakerChanged },
        body: {
          from: nA.body,
          to: nB.body,
          changed: bodyChanged,
          lines: bodyChanged ? computeLineDiff(nA.body, nB.body) : undefined,
        },
        position: { from: nA.position, to: nB.position, changed: positionChanged },
        hasNarrativeChange,
        hasLayoutChange,
      });
    }
  }

  // 3. Edges
  const edgesA = new Map<string, FlowEdge>();
  for (const e of projectA.edges) edgesA.set(e.id, e);

  const edgesB = new Map<string, FlowEdge>();
  for (const e of projectB.edges) edgesB.set(e.id, e);

  const allEdgeIds = Array.from(new Set([...edgesA.keys(), ...edgesB.keys()])).sort();
  const edgeDiffs: EdgeDiff[] = [];
  let edgesAdded = 0;
  let edgesRemoved = 0;
  let edgesModified = 0;

  for (const id of allEdgeIds) {
    const eA = edgesA.get(id);
    const eB = edgesB.get(id);

    if (!eA && eB) {
      edgesAdded++;
      edgeDiffs.push({
        id,
        type: "added",
        from: { to: eB.from, changed: true },
        to: { to: eB.to, changed: true },
        condition: { to: eB.condition, changed: eB.condition !== undefined },
        effects: { to: eB.effects, changed: (eB.effects?.length ?? 0) > 0 },
        hasNarrativeChange: eB.condition !== undefined || (eB.effects?.length ?? 0) > 0,
        hasStructuralChange: true,
      });
    } else if (eA && !eB) {
      edgesRemoved++;
      edgeDiffs.push({
        id,
        type: "removed",
        from: { from: eA.from, changed: true },
        to: { from: eA.to, changed: true },
        condition: { from: eA.condition, changed: eA.condition !== undefined },
        effects: { from: eA.effects, changed: (eA.effects?.length ?? 0) > 0 },
        hasNarrativeChange: eA.condition !== undefined || (eA.effects?.length ?? 0) > 0,
        hasStructuralChange: true,
      });
    } else if (eA && eB) {
      const fromChanged = eA.from !== eB.from;
      const toChanged = eA.to !== eB.to;
      const conditionChanged = (eA.condition ?? null) !== (eB.condition ?? null);
      const effectsChanged = !effectsEqual(eA.effects, eB.effects);

      const hasStructuralChange = fromChanged || toChanged;
      const hasNarrativeChange = conditionChanged || effectsChanged;
      const isModified = hasStructuralChange || hasNarrativeChange;

      if (isModified) {
        edgesModified++;
      }

      edgeDiffs.push({
        id,
        type: isModified ? "modified" : "unchanged",
        from: { from: eA.from, to: eB.from, changed: fromChanged },
        to: { from: eA.to, to: eB.to, changed: toChanged },
        condition: { from: eA.condition, to: eB.condition, changed: conditionChanged },
        effects: { from: eA.effects, to: eB.effects, changed: effectsChanged },
        hasNarrativeChange,
        hasStructuralChange,
      });
    }
  }

  // 4. Entities
  const entitiesA = new Map<string, Entity>();
  for (const ent of projectA.entities ?? []) entitiesA.set(ent.id, ent);

  const entitiesB = new Map<string, Entity>();
  for (const ent of projectB.entities ?? []) entitiesB.set(ent.id, ent);

  const allEntityIds = Array.from(new Set([...entitiesA.keys(), ...entitiesB.keys()]));
  allEntityIds.sort((id1, id2) => {
    const n1 = (entitiesB.get(id1)?.name ?? entitiesA.get(id1)?.name ?? "").toLowerCase();
    const n2 = (entitiesB.get(id2)?.name ?? entitiesA.get(id2)?.name ?? "").toLowerCase();
    const cmp = n1.localeCompare(n2);
    return cmp !== 0 ? cmp : id1.localeCompare(id2);
  });

  const entityDiffs: EntityDiff[] = [];
  let entitiesAdded = 0;
  let entitiesRemoved = 0;
  let entitiesModified = 0;

  for (const id of allEntityIds) {
    const entA = entitiesA.get(id);
    const entB = entitiesB.get(id);

    if (!entA && entB) {
      entitiesAdded++;
      entityDiffs.push({
        id,
        type: "added",
        name: { to: entB.name, changed: true },
        kind: { to: entB.kind, changed: true },
        description: { to: entB.description, changed: entB.description !== undefined },
        hasNarrativeChange: true,
      });
    } else if (entA && !entB) {
      entitiesRemoved++;
      entityDiffs.push({
        id,
        type: "removed",
        name: { from: entA.name, changed: true },
        kind: { from: entA.kind, changed: true },
        description: { from: entA.description, changed: entA.description !== undefined },
        hasNarrativeChange: true,
      });
    } else if (entA && entB) {
      const nameChanged = entA.name !== entB.name;
      const kindChanged = entA.kind !== entB.kind;
      const descChanged = (entA.description ?? null) !== (entB.description ?? null);
      const isModified = nameChanged || kindChanged || descChanged;

      if (isModified) {
        entitiesModified++;
      }

      entityDiffs.push({
        id,
        type: isModified ? "modified" : "unchanged",
        name: { from: entA.name, to: entB.name, changed: nameChanged },
        kind: { from: entA.kind, to: entB.kind, changed: kindChanged },
        description: { from: entA.description, to: entB.description, changed: descChanged },
        hasNarrativeChange: isModified,
      });
    }
  }

  // 5. Variables
  const varsA = new Map<string, Variable>();
  for (const v of projectA.variables) varsA.set(v.id, v);

  const varsB = new Map<string, Variable>();
  for (const v of projectB.variables) varsB.set(v.id, v);

  const allVarIds = Array.from(new Set([...varsA.keys(), ...varsB.keys()]));
  allVarIds.sort((id1, id2) => {
    const n1 = (varsB.get(id1)?.name ?? varsA.get(id1)?.name ?? "").toLowerCase();
    const n2 = (varsB.get(id2)?.name ?? varsA.get(id2)?.name ?? "").toLowerCase();
    const cmp = n1.localeCompare(n2);
    return cmp !== 0 ? cmp : id1.localeCompare(id2);
  });

  const variableDiffs: VariableDiff[] = [];
  let variablesAdded = 0;
  let variablesRemoved = 0;
  let variablesModified = 0;

  for (const id of allVarIds) {
    const vA = varsA.get(id);
    const vB = varsB.get(id);

    if (!vA && vB) {
      variablesAdded++;
      variableDiffs.push({
        id,
        type: "added",
        name: { to: vB.name, changed: true },
        varType: { to: vB.type, changed: true },
        initial: { to: vB.initial, changed: vB.initial !== undefined },
        hasNarrativeChange: true,
      });
    } else if (vA && !vB) {
      variablesRemoved++;
      variableDiffs.push({
        id,
        type: "removed",
        name: { from: vA.name, changed: true },
        varType: { from: vA.type, changed: true },
        initial: { from: vA.initial, changed: vA.initial !== undefined },
        hasNarrativeChange: true,
      });
    } else if (vA && vB) {
      const nameChanged = vA.name !== vB.name;
      const typeChanged = vA.type !== vB.type;
      const initialChanged = !valuesEqual(vA.initial, vB.initial);
      const isModified = nameChanged || typeChanged || initialChanged;

      if (isModified) {
        variablesModified++;
      }

      variableDiffs.push({
        id,
        type: isModified ? "modified" : "unchanged",
        name: { from: vA.name, to: vB.name, changed: nameChanged },
        varType: { from: vA.type, to: vB.type, changed: typeChanged },
        initial: { from: vA.initial, to: vB.initial, changed: initialChanged },
        hasNarrativeChange: isModified,
      });
    }
  }

  // Summary counts
  const narrativeChanges =
    (nameChanged ? 1 : 0) +
    nodeDiffs.filter((n) => n.type !== "unchanged" && n.hasNarrativeChange).length +
    edgeDiffs.filter((e) => e.type !== "unchanged" && e.hasNarrativeChange).length +
    entityDiffs.filter((ent) => ent.type !== "unchanged").length +
    variableDiffs.filter((v) => v.type !== "unchanged").length;

  const structuralChanges =
    edgesAdded +
    edgesRemoved +
    edgeDiffs.filter((e) => e.type === "modified" && e.hasStructuralChange).length +
    nodesAdded +
    nodesRemoved;

  const layoutChanges = nodeDiffs.filter(
    (n) => n.type === "modified" && n.hasLayoutChange && !n.hasNarrativeChange,
  ).length;

  const totalChanges =
    (nameChanged ? 1 : 0) +
    nodesAdded +
    nodesRemoved +
    nodesModified +
    edgesAdded +
    edgesRemoved +
    edgesModified +
    entitiesAdded +
    entitiesRemoved +
    entitiesModified +
    variablesAdded +
    variablesRemoved +
    variablesModified;

  return {
    summary: {
      totalChanges,
      narrativeChanges,
      structuralChanges,
      layoutChanges,
      nodesAdded,
      nodesRemoved,
      nodesModified,
      edgesAdded,
      edgesRemoved,
      edgesModified,
      entitiesAdded,
      entitiesRemoved,
      entitiesModified,
      variablesAdded,
      variablesRemoved,
      variablesModified,
      nameChanged,
    },
    projectName,
    nodes: nodeDiffs,
    edges: edgeDiffs,
    entities: entityDiffs,
    variables: variableDiffs,
  };
}
