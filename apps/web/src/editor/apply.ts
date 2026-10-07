import {
  ProjectSchema,
  FlowNodeSchema,
  FlowEdgeSchema,
  VariableSchema,
  EntitySchema,
  MAX_ENTITIES_PER_PROJECT,
  getEntities,
  type Project,
} from "@repo/schema";
import type { EditorAction, EditorState, ApplyResult, EditorError } from "./types";
import { structurallyEqual } from "./equal";
import { HISTORY_CAP } from "./history";

export function apply(state: EditorState, action: EditorAction): ApplyResult {
  const result = computeNextProject(state.present, action);
  if (!result.ok) {
    return result;
  }

  const newProject = result.project;

  // No-op detection: if project is structurally equal, return identical state reference
  if (structurallyEqual(newProject, state.present)) {
    return { ok: true, state };
  }

  const newPast = [...state.past, state.present];
  if (newPast.length > HISTORY_CAP) {
    newPast.shift();
  }

  return {
    ok: true,
    state: {
      present: newProject,
      past: newPast,
      future: [],
    },
  };
}

type ProjectComputeResult =
  | { ok: true; project: Project }
  | { ok: false; error: EditorError };

function computeNextProject(
  present: Project,
  action: EditorAction
): ProjectComputeResult {
  switch (action.type) {
    case "renameProject": {
      const nameResult = ProjectSchema.shape.name.safeParse(action.name);
      if (!nameResult.success) {
        return {
          ok: false,
          error: { code: "invalid", message: nameResult.error.message },
        };
      }
      return {
        ok: true,
        project: {
          ...present,
          name: nameResult.data,
        },
      };
    }

    case "addNode": {
      if (present.nodes.some((n) => n.id === action.node.id)) {
        return {
          ok: false,
          error: {
            code: "duplicate-id",
            message: `Node with id '${action.node.id}' already exists`,
          },
        };
      }
      const nodeResult = FlowNodeSchema.safeParse(action.node);
      if (!nodeResult.success) {
        return {
          ok: false,
          error: { code: "invalid", message: nodeResult.error.message },
        };
      }
      return {
        ok: true,
        project: {
          ...present,
          nodes: [...present.nodes, nodeResult.data],
        },
      };
    }

    case "updateNode": {
      const idx = present.nodes.findIndex((n) => n.id === action.id);
      const existing = idx !== -1 ? present.nodes[idx] : undefined;
      if (idx === -1 || !existing) {
        return {
          ok: false,
          error: {
            code: "not-found",
            message: `Node with id '${action.id}' not found`,
          },
        };
      }
      const updated: Record<string, unknown> = { ...existing };
      if (action.patch.title !== undefined) updated.title = action.patch.title;
      if (action.patch.type !== undefined) updated.type = action.patch.type;
      if (action.patch.position === null) {
        delete updated.position;
      } else if (action.patch.position !== undefined) {
        updated.position = action.patch.position;
      }
      if (action.patch.body === null) {
        delete updated.body;
      } else if (action.patch.body !== undefined) {
        updated.body = action.patch.body;
      }
      if (action.patch.speakerId === null) {
        delete updated.speakerId;
      } else if (action.patch.speakerId !== undefined) {
        updated.speakerId = action.patch.speakerId;
      }

      if (updated.speakerId !== undefined) {
        const entities = getEntities(present);
        const entity = entities.find((e) => e.id === updated.speakerId);
        if (!entity) {
          return {
            ok: false,
            error: {
              code: "dangling-reference",
              message: `Speaker '${updated.speakerId}' not found in entities (missing reference)`,
            },
          };
        }
        if (entity.kind !== "character") {
          return {
            ok: false,
            error: {
              code: "dangling-reference",
              message: `Speaker '${updated.speakerId}' is a '${entity.kind}', not a character`,
            },
          };
        }
      }

      const nodeResult = FlowNodeSchema.safeParse(updated);
      if (!nodeResult.success) {
        return {
          ok: false,
          error: { code: "invalid", message: nodeResult.error.message },
        };
      }

      const newNodes = [...present.nodes];
      newNodes[idx] = structurallyEqual(nodeResult.data, existing) ? existing : nodeResult.data;
      return {
        ok: true,
        project: {
          ...present,
          nodes: newNodes,
        },
      };
    }

    case "moveNode": {
      const idx = present.nodes.findIndex((n) => n.id === action.id);
      const existing = idx !== -1 ? present.nodes[idx] : undefined;
      if (idx === -1 || !existing) {
        return {
          ok: false,
          error: {
            code: "not-found",
            message: `Node with id '${action.id}' not found`,
          },
        };
      }
      const updated = {
        ...existing,
        position: action.position,
      };

      const nodeResult = FlowNodeSchema.safeParse(updated);
      if (!nodeResult.success) {
        return {
          ok: false,
          error: { code: "invalid", message: nodeResult.error.message },
        };
      }

      const newNodes = [...present.nodes];
      newNodes[idx] = nodeResult.data;
      return {
        ok: true,
        project: {
          ...present,
          nodes: newNodes,
        },
      };
    }

    case "deleteNode": {
      const idx = present.nodes.findIndex((n) => n.id === action.id);
      if (idx === -1) {
        return {
          ok: false,
          error: {
            code: "not-found",
            message: `Node with id '${action.id}' not found`,
          },
        };
      }
      const newNodes = present.nodes.filter((n) => n.id !== action.id);
      const hasIncidentEdges = present.edges.some(
        (e) => e.from === action.id || e.to === action.id
      );
      const newEdges = hasIncidentEdges
        ? present.edges.filter((e) => e.from !== action.id && e.to !== action.id)
        : present.edges;

      return {
        ok: true,
        project: {
          ...present,
          nodes: newNodes,
          edges: newEdges,
        },
      };
    }

    case "addEdge": {
      if (present.edges.some((e) => e.id === action.edge.id)) {
        return {
          ok: false,
          error: {
            code: "duplicate-id",
            message: `Edge with id '${action.edge.id}' already exists`,
          },
        };
      }
      const nodeIds = new Set(present.nodes.map((n) => n.id));
      if (!nodeIds.has(action.edge.from) || !nodeIds.has(action.edge.to)) {
        return {
          ok: false,
          error: {
            code: "dangling-reference",
            message: `Edge connects to non-existent node ('${action.edge.from}' -> '${action.edge.to}')`,
          },
        };
      }
      const edgeResult = FlowEdgeSchema.safeParse(action.edge);
      if (!edgeResult.success) {
        return {
          ok: false,
          error: { code: "invalid", message: edgeResult.error.message },
        };
      }
      return {
        ok: true,
        project: {
          ...present,
          edges: [...present.edges, edgeResult.data],
        },
      };
    }

    case "updateEdge": {
      const idx = present.edges.findIndex((e) => e.id === action.id);
      const existing = idx !== -1 ? present.edges[idx] : undefined;
      if (idx === -1 || !existing) {
        return {
          ok: false,
          error: {
            code: "not-found",
            message: `Edge with id '${action.id}' not found`,
          },
        };
      }
      const updated: Record<string, unknown> = { ...existing };
      if (action.patch.from !== undefined) updated.from = action.patch.from;
      if (action.patch.to !== undefined) updated.to = action.patch.to;
      if (action.patch.condition === null) {
        delete updated.condition;
      } else if (action.patch.condition !== undefined) {
        updated.condition = action.patch.condition;
      }
      if (action.patch.effects === null) {
        delete updated.effects;
      } else if (action.patch.effects !== undefined) {
        updated.effects = action.patch.effects;
      }

      const targetFrom = typeof updated.from === "string" ? updated.from : existing.from;
      const targetTo = typeof updated.to === "string" ? updated.to : existing.to;
      const nodeIds = new Set(present.nodes.map((n) => n.id));
      if (!nodeIds.has(targetFrom) || !nodeIds.has(targetTo)) {
        return {
          ok: false,
          error: {
            code: "dangling-reference",
            message: `Edge connects to non-existent node ('${targetFrom}' -> '${targetTo}')`,
          },
        };
      }

      const edgeResult = FlowEdgeSchema.safeParse(updated);
      if (!edgeResult.success) {
        return {
          ok: false,
          error: { code: "invalid", message: edgeResult.error.message },
        };
      }

      const newEdges = [...present.edges];
      newEdges[idx] = edgeResult.data;
      return {
        ok: true,
        project: {
          ...present,
          edges: newEdges,
        },
      };
    }

    case "deleteEdge": {
      const idx = present.edges.findIndex((e) => e.id === action.id);
      if (idx === -1) {
        return {
          ok: false,
          error: {
            code: "not-found",
            message: `Edge with id '${action.id}' not found`,
          },
        };
      }
      const newEdges = present.edges.filter((e) => e.id !== action.id);
      return {
        ok: true,
        project: {
          ...present,
          edges: newEdges,
        },
      };
    }

    case "addVariable": {
      if (present.variables.some((v) => v.id === action.variable.id)) {
        return {
          ok: false,
          error: {
            code: "duplicate-id",
            message: `Variable with id '${action.variable.id}' already exists`,
          },
        };
      }
      const varResult = VariableSchema.safeParse(action.variable);
      if (!varResult.success) {
        return {
          ok: false,
          error: { code: "invalid", message: varResult.error.message },
        };
      }
      return {
        ok: true,
        project: {
          ...present,
          variables: [...present.variables, varResult.data],
        },
      };
    }

    case "updateVariable": {
      const idx = present.variables.findIndex((v) => v.id === action.id);
      const existing = idx !== -1 ? present.variables[idx] : undefined;
      if (idx === -1 || !existing) {
        return {
          ok: false,
          error: {
            code: "not-found",
            message: `Variable with id '${action.id}' not found`,
          },
        };
      }
      const updated: Record<string, unknown> = { ...existing };
      if (action.patch.name !== undefined) updated.name = action.patch.name;
      if (action.patch.type !== undefined) updated.type = action.patch.type;
      if (action.patch.initial === null) {
        delete updated.initial;
      } else if (action.patch.initial !== undefined) {
        updated.initial = action.patch.initial;
      }

      const varResult = VariableSchema.safeParse(updated);
      if (!varResult.success) {
        return {
          ok: false,
          error: { code: "invalid", message: varResult.error.message },
        };
      }

      const newVars = [...present.variables];
      newVars[idx] = varResult.data;
      return {
        ok: true,
        project: {
          ...present,
          variables: newVars,
        },
      };
    }

    case "deleteVariable": {
      const idx = present.variables.findIndex((v) => v.id === action.id);
      if (idx === -1) {
        return {
          ok: false,
          error: {
            code: "not-found",
            message: `Variable with id '${action.id}' not found`,
          },
        };
      }
      const newVars = present.variables.filter((v) => v.id !== action.id);
      return {
        ok: true,
        project: {
          ...present,
          variables: newVars,
        },
      };
    }

    case "addEntity": {
      const currentEntities = getEntities(present);
      if (currentEntities.length >= MAX_ENTITIES_PER_PROJECT) {
        return {
          ok: false,
          error: {
            code: "invalid",
            message: `Project exceeds maximum entity limit of ${MAX_ENTITIES_PER_PROJECT}`,
          },
        };
      }
      if (currentEntities.some((e) => e.id === action.entity.id)) {
        return {
          ok: false,
          error: {
            code: "duplicate-id",
            message: `Entity with id '${action.entity.id}' already exists`,
          },
        };
      }
      const entityResult = EntitySchema.safeParse(action.entity);
      if (!entityResult.success) {
        return {
          ok: false,
          error: { code: "invalid", message: entityResult.error.message },
        };
      }
      return {
        ok: true,
        project: {
          ...present,
          entities: [...currentEntities, entityResult.data],
        },
      };
    }

    case "updateEntity": {
      const currentEntities = getEntities(present);
      const idx = currentEntities.findIndex((e) => e.id === action.id);
      const existing = idx !== -1 ? currentEntities[idx] : undefined;
      if (idx === -1 || !existing) {
        return {
          ok: false,
          error: {
            code: "not-found",
            message: `Entity with id '${action.id}' not found`,
          },
        };
      }

      if (
        action.patch.kind !== undefined &&
        action.patch.kind !== existing.kind &&
        existing.kind === "character"
      ) {
        const affectedNodes = present.nodes.filter((n) => n.speakerId === action.id);
        if (affectedNodes.length > 0) {
          return {
            ok: false,
            error: {
              code: "dangling-reference",
              message: `Cannot change kind of character '${existing.name}': used as speaker by ${affectedNodes.length} node(s)`,
            },
          };
        }
      }

      const updated: Record<string, unknown> = { ...existing };
      if (action.patch.name !== undefined) updated.name = action.patch.name;
      if (action.patch.kind !== undefined) updated.kind = action.patch.kind;
      if (action.patch.description === null) {
        delete updated.description;
      } else if (action.patch.description !== undefined) {
        updated.description = action.patch.description;
      }

      const entityResult = EntitySchema.safeParse(updated);
      if (!entityResult.success) {
        return {
          ok: false,
          error: { code: "invalid", message: entityResult.error.message },
        };
      }

      const newEntities = [...currentEntities];
      newEntities[idx] = structurallyEqual(entityResult.data, existing) ? existing : entityResult.data;
      return {
        ok: true,
        project: {
          ...present,
          entities: newEntities,
        },
      };
    }

    case "deleteEntity": {
      const currentEntities = getEntities(present);
      const exists = currentEntities.some((e) => e.id === action.id);
      if (!exists) {
        return {
          ok: false,
          error: {
            code: "not-found",
            message: `Entity with id '${action.id}' not found`,
          },
        };
      }

      const newEntities = currentEntities.filter((e) => e.id !== action.id);
      let anyNodeChanged = false;
      const newNodes = present.nodes.map((node) => {
        if (node.speakerId === action.id) {
          anyNodeChanged = true;
          const updatedNode = { ...node };
          delete updatedNode.speakerId;
          return updatedNode;
        }
        return node;
      });

      return {
        ok: true,
        project: {
          ...present,
          nodes: anyNodeChanged ? newNodes : present.nodes,
          entities: newEntities,
        },
      };
    }
  }
}
