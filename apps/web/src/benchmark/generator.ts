import type {
  Entity,
  FlowEdge,
  FlowNode,
  Project,
  Variable,
  VariableType,
} from "@repo/schema";
import type {
  BenchmarkOptions,
  BenchmarkWithDefectsResult,
  PlantedDefect,
} from "./types.js";

const DEFAULT_SPEAKER_POOL = [
  "Aether", "Lumine", "Jean", "Diluc", "Venti", "Zhongli", "Raiden", "Nahida",
  "Furina", "Neuvillette", "Alhaitham", "Kaveh", "Cyno", "Tighnari", "Xiao",
  "Ganyu", "Keqing", "Hu Tao", "Yelan", "Ayaka", "Ayato", "Yoimiya", "Itto",
  "Kazuha", "Scaramouche", "Tartaglia", "Navia", "Clorinde", "Wriothesley", "Arlecchino",
  "Lyney", "Lynette", "Freminet", "Chiori", "Sigewinne", "Emilie", "Mualani",
  "Kinich", "Kachina", "Xilonen", "Chasca", "Ororon", "Mavuika", "Citlali",
  "Amber", "Kaeya", "Lisa", "Barbara", "Noelle", "Bennett",
];

function createPrng(seed: number) {
  let a = seed >>> 0;
  function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function nextInt(min: number, max: number): number {
    return Math.floor(next() * (max - min + 1)) + min;
  }
  function pick<T>(arr: T[], fallback: T): T {
    if (arr.length === 0) return fallback;
    const index = Math.floor(next() * arr.length);
    return arr[index] ?? fallback;
  }
  return { next, nextInt, pick };
}

export function generateBenchmarkProject(
  options: BenchmarkOptions & { defects: "planted" },
): BenchmarkWithDefectsResult;
export function generateBenchmarkProject(
  options?: BenchmarkOptions,
): Project;
export function generateBenchmarkProject(
  options: BenchmarkOptions = { seed: 1, nodeCount: 50 },
): Project | BenchmarkWithDefectsResult {
  const { seed, nodeCount } = options;
  if (nodeCount < 3) {
    throw new Error(`nodeCount must be at least 3, got ${nodeCount}`);
  }

  // Cast size validation: require castSize <= nodeCount; if omitted, default Math.min(30, nodeCount)
  if (options.castSize !== undefined && options.castSize > nodeCount) {
    throw new Error(
      `castSize (${options.castSize}) cannot exceed nodeCount (${nodeCount})`,
    );
  }
  const targetCastSize = options.castSize ?? Math.min(30, nodeCount);

  const prng = createPrng(seed);

  // Ending count: default Math.max(1, Math.min(5, Math.floor(nodeCount / 20)))
  const endingCount = Math.max(
    1,
    Math.min(
      options.endingCount ?? Math.max(1, Math.min(5, Math.floor(nodeCount / 20))),
      nodeCount - 2,
    ),
  );

  const sceneCount = nodeCount - 1 - endingCount;
  const isPlanted = options.defects === "planted";

  // Build cast pool of size targetCastSize
  // Build cast pool of size targetCastSize and character entities
  const castPool: string[] = [];
  const entities: Entity[] = [];
  const charIdBySpeaker = new Map<string, string>();
  for (let i = 0; i < targetCastSize; i++) {
    const defaultName = DEFAULT_SPEAKER_POOL[i];
    const name = defaultName !== undefined ? defaultName : `Speaker_${i + 1}`;
    castPool.push(name);
    const id = `char_${i + 1}`;
    entities.push({
      id,
      name,
      kind: "character",
      description: `Cast member ${name}`,
    });
    charIdBySpeaker.set(name, id);
  }

  // Round-robin assign speakers to guarantee every castPool member is used exactly across the project
  let speakerAssignmentIdx = 0;
  function getNextSpeaker(): { name: string; id: string } {
    let name: string;
    if (speakerAssignmentIdx < targetCastSize) {
      name = castPool[speakerAssignmentIdx++] ?? castPool[0] ?? "Narrator";
    } else {
      name = prng.pick(castPool, castPool[0] ?? "Narrator");
    }
    const id = charIdBySpeaker.get(name) ?? entities[0]?.id ?? "char_1";
    return { name, id };
  }

  const nodes: FlowNode[] = [];

  // Start node
  const startSpeaker = getNextSpeaker();
  const startNode: FlowNode = {
    id: "node_start",
    type: "start",
    title: `${startSpeaker.name}: Prologue Beginning`,
    speakerId: startSpeaker.id,
    body: `Prologue opening dialogue spoken by ${startSpeaker.name}.`,
    position: { x: 0, y: 0 },
  };
  nodes.push(startNode);

  // Layering for scenes
  const HORIZONTAL_GAP = 380;
  const VERTICAL_GAP = 140;

  const sceneLayerCount = Math.max(2, Math.min(40, Math.floor(sceneCount / 4)));
  const sceneLayers: FlowNode[][] = [];
  for (let l = 0; l < sceneLayerCount; l++) {
    sceneLayers.push([]);
  }

  const sceneNodes: FlowNode[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const layerIdx = Math.floor((i * sceneLayerCount) / sceneCount);
    const targetLayer = sceneLayers[layerIdx] ?? sceneLayers[0] ?? [];
    const indexInLayer = targetLayer.length;

    const speaker = getNextSpeaker();
    const sceneNode: FlowNode = {
      id: `node_scene_${i}`,
      type: "scene",
      title: `${speaker.name}: Scene ${i + 1}`,
      speakerId: speaker.id,
      body: `Scene ${i + 1} narrative and dialogue spoken by ${speaker.name}.`,
      position: {
        x: (layerIdx + 1) * HORIZONTAL_GAP,
        y: indexInLayer * VERTICAL_GAP,
      },
    };

    sceneNodes.push(sceneNode);
    targetLayer.push(sceneNode);
    nodes.push(sceneNode);
  }

  // End nodes
  const endNodes: FlowNode[] = [];
  const endLayerX = (sceneLayerCount + 1) * HORIZONTAL_GAP;
  for (let i = 0; i < endingCount; i++) {
    const speaker = getNextSpeaker();
    const endNode: FlowNode = {
      id: `node_end_${i}`,
      type: "end",
      title: `${speaker.name}: Ending ${i + 1}`,
      speakerId: speaker.id,
      body: `Ending ${i + 1} conclusion spoken by ${speaker.name}.`,
      position: {
        x: endLayerX,
        y: i * VERTICAL_GAP,
      },
    };
    endNodes.push(endNode);
    nodes.push(endNode);
  }

  // 2. Variables
  const targetVarCount = options.variableCount ?? Math.max(2, Math.min(20, Math.floor(nodeCount / 10)));
  const variables: Variable[] = [];
  for (let i = 0; i < targetVarCount; i++) {
    const typeMod = i % 3;
    let varType: VariableType;
    let initial: string | number | boolean;

    if (typeMod === 0) {
      varType = "boolean";
      initial = false;
    } else if (typeMod === 1) {
      varType = "number";
      initial = 0;
    } else {
      varType = "string";
      initial = "init";
    }

    variables.push({
      id: `var_${i}`,
      name: `v_${i}`,
      type: varType,
      initial,
    });
  }

  // 3. Build CLEAN graph edges
  let edges: FlowEdge[] = [];
  let edgeIdSeq = 0;

  function addEdge(from: string, to: string, condition?: string, effects?: string[]): FlowEdge {
    const edge: FlowEdge = {
      id: `edge_${edgeIdSeq++}`,
      from,
      to,
      ...(condition !== undefined ? { condition } : {}),
      ...(effects !== undefined && effects.length > 0 ? { effects } : {}),
    };
    edges.push(edge);
    return edge;
  }

  // Start -> Layer 0
  const firstLayer = sceneLayers[0] ?? [];
  for (const scene of firstLayer) {
    addEdge(startNode.id, scene.id);
  }

  // Scene layers forward connections with multi-parent redundancy
  for (let l = 0; l < sceneLayerCount - 1; l++) {
    const currentLayer = sceneLayers[l] ?? [];
    const nextLayer = sceneLayers[l + 1] ?? [];
    if (currentLayer.length === 0 || nextLayer.length === 0) continue;

    for (let i = 0; i < currentLayer.length; i++) {
      const source = currentLayer[i];
      const primaryTarget = nextLayer[i % nextLayer.length];
      if (source && primaryTarget) {
        addEdge(source.id, primaryTarget.id);
      }

      if (nextLayer.length > 1) {
        const secondaryTarget = nextLayer[(i + 1) % nextLayer.length];
        if (source && secondaryTarget) {
          addEdge(source.id, secondaryTarget.id);
        }
      }
    }

    for (let j = 0; j < nextLayer.length; j++) {
      const target = nextLayer[j];
      if (!target) continue;
      const incoming = edges.filter((e) => e.to === target.id);
      if (incoming.length < 2 && currentLayer.length > 1) {
        const altSource = currentLayer[(j + 2) % currentLayer.length];
        if (altSource && !edges.some((e) => e.from === altSource.id && e.to === target.id)) {
          addEdge(altSource.id, target.id);
        }
      }
    }
  }

  // Last scene layer -> End nodes
  const lastLayer = sceneLayers[sceneLayerCount - 1] ?? [];
  if (lastLayer.length > 0 && endNodes.length > 0) {
    for (let i = 0; i < lastLayer.length; i++) {
      const source = lastLayer[i];
      const endTarget = endNodes[i % endNodes.length];
      if (source && endTarget) {
        addEdge(source.id, endTarget.id);
      }

      if (endNodes.length > 1) {
        const altEnd = endNodes[(i + 1) % endNodes.length];
        if (source && altEnd) {
          addEdge(source.id, altEnd.id);
        }
      }
    }

    // Ensure every end node has at least 2 incoming edges (or from all lastLayer nodes if <= 2)
    for (let j = 0; j < endNodes.length; j++) {
      const endNode = endNodes[j];
      if (!endNode) continue;
      for (let k = 0; k < Math.min(2, lastLayer.length); k++) {
        const src = lastLayer[(j + k) % lastLayer.length];
        if (src && !edges.some((e) => e.from === src.id && e.to === endNode.id)) {
          addEdge(src.id, endNode.id);
        }
      }
    }
  }

  // 4. Graft Planted Defects onto the clean graph
  const defects: PlantedDefect[] = [];

  // Intended expected issues:
  // 1. cannot-reach-end on deadEndNode:
  //    Receives incoming edge from clean node (startNode), but has zero outgoing edges.
  //    No other node depends on deadEndNode.
  //    Expected issue: { ruleId: "cannot-reach-end", severity: "error", nodeId: deadEndNode.id }
  // 2. unreachable-from-start on unreachableNode:
  //    Has zero incoming edges, but has outgoing edge to endNodes[0].
  //    endNodes[0] retains other incoming paths from clean nodes.
  //    Expected issue: { ruleId: "unreachable-from-start", severity: "warning", nodeId: unreachableNode.id }
  // 3. undefined-variable on undefinedVarNode:
  //    Clean node in reachable graph whose outgoing edge references undeclared variable.
  //    Expected issue: { ruleId: "undefined-variable", severity: "error", nodeId: undefinedVarNode.id }
  let deadEndNodeId: string | null = null;
  let unreachableNodeId: string | null = null;
  let undefinedVarEdgeId: string | null = null;

  if (isPlanted && sceneNodes.length >= 3 && endNodes.length > 0) {
    const unreachableNode = sceneNodes[0];
    const deadEndNode = sceneNodes[sceneNodes.length - 1];
    const undefinedVarNode = sceneNodes[1];
    const firstEndNode = endNodes[0];

    if (unreachableNode && deadEndNode && undefinedVarNode && firstEndNode) {
      deadEndNodeId = deadEndNode.id;
      unreachableNodeId = unreachableNode.id;

      // Defect 1: cannot-reach-end
      // For every node that currently receives an edge from deadEndNode, ensure it has an alternate incoming edge from a clean node
      const deadEndOutgoing = edges.filter((e) => e.from === deadEndNode.id);
      const cleanSource = sceneNodes[2] ?? startNode;
      for (const outEdge of deadEndOutgoing) {
        const otherIncoming = edges.filter((e) => e.to === outEdge.to && e.from !== deadEndNode.id);
        if (otherIncoming.length === 0) {
          addEdge(cleanSource.id, outEdge.to);
        }
      }
      // Now remove all outgoing edges from deadEndNode
      edges = edges.filter((e) => e.from !== deadEndNode.id);
      // Ensure deadEndNode has an incoming edge from startNode
      if (!edges.some((e) => e.to === deadEndNode.id)) {
        addEdge(startNode.id, deadEndNode.id);
      }
      defects.push({
        kind: "cannot-reach-end",
        nodeId: deadEndNode.id,
      });

      // Defect 2: unreachable-from-start
      // Remove all incoming edges to unreachableNode
      edges = edges.filter((e) => e.to !== unreachableNode.id);
      // Ensure unreachableNode connects to firstEndNode so it reaches an end
      if (!edges.some((e) => e.from === unreachableNode.id && e.to === firstEndNode.id)) {
        addEdge(unreachableNode.id, firstEndNode.id);
      }
      // Ensure firstEndNode still has incoming edges from clean nodes
      const cleanEndIncoming = edges.filter(
        (e) => e.to === firstEndNode.id && e.from !== unreachableNode.id && e.from !== deadEndNode.id,
      );
      if (cleanEndIncoming.length === 0) {
        addEdge(cleanSource.id, firstEndNode.id);
      }
      defects.push({
        kind: "unreachable-from-start",
        nodeId: unreachableNode.id,
      });

      // Defect 3: undefined-variable
      const edgeFromUndef = edges.find(
        (e) => e.from === undefinedVarNode.id && e.to !== deadEndNode.id && e.to !== unreachableNode.id,
      );
      if (edgeFromUndef) {
        edgeFromUndef.condition = "planted_missing_var == true";
        undefinedVarEdgeId = edgeFromUndef.id;
      } else {
        const graftedEdge = addEdge(undefinedVarNode.id, firstEndNode.id, "planted_missing_var == true");
        undefinedVarEdgeId = graftedEdge.id;
      }
      defects.push({
        kind: "undefined-variable",
        nodeId: undefinedVarNode.id,
      });
    }
  }

  // 5. Attach Conditions and Effects to Clean Reachable Edges
  const cleanEdges = edges.filter((e) => {
    if (deadEndNodeId && (e.from === deadEndNodeId || e.to === deadEndNodeId)) return false;
    if (unreachableNodeId && (e.from === unreachableNodeId || e.to === unreachableNodeId)) return false;
    if (undefinedVarEdgeId && e.id === undefinedVarEdgeId) return false;
    return true;
  });

  if (cleanEdges.length > 0) {
    for (let i = 0; i < variables.length; i++) {
      const v = variables[i];
      if (!v) continue;

      let condStr: string;
      let effectStr: string;

      if (v.type === "boolean") {
        condStr = `${v.name} == true`;
        effectStr = `${v.name} = true`;
      } else if (v.type === "number") {
        condStr = `${v.name} >= 0`;
        effectStr = `${v.name} = ${v.name} + 1`;
      } else {
        condStr = `${v.name} == "init"`;
        effectStr = `${v.name} = "updated"`;
      }

      // Assign effect to writeEdge
      const writeEdgeIndex = (i * 2) % cleanEdges.length;
      const writeEdge = cleanEdges[writeEdgeIndex];
      if (writeEdge) {
        writeEdge.effects = writeEdge.effects ?? [];
        writeEdge.effects.push(effectStr);
      }

      // Assign condition to readEdge
      const readEdgeIndex = (i * 2 + 1) % cleanEdges.length;
      const readEdge = cleanEdges[readEdgeIndex];
      if (readEdge) {
        if (readEdge.condition === undefined) {
          readEdge.condition = condStr;
        } else {
          readEdge.condition = `(${readEdge.condition}) && (${condStr})`;
        }
      }
    }
  }

  const project: Project = {
    id: `proj_benchmark_${seed}_${nodeCount}`,
    name: `Benchmark Story ${nodeCount} Nodes`,
    entities,
    nodes,
    edges,
    variables,
  };

  if (isPlanted) {
    return {
      project,
      defects,
    };
  }

  return project;
}

export function generateBenchmarkWithDefects(
  options: BenchmarkOptions,
): BenchmarkWithDefectsResult {
  return generateBenchmarkProject({
    ...options,
    defects: "planted",
  }) as BenchmarkWithDefectsResult;
}
