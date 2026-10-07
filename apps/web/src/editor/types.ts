import type { Project, FlowNode, FlowEdge, Variable, Entity, EntityKind } from "@repo/schema";

export interface EditorState {
  present: Project;
  past: Project[];
  future: Project[];
}

export type EditorAction =
  | { type: "renameProject"; name: string }
  | { type: "addNode"; node: FlowNode }
  | {
      type: "updateNode";
      id: string;
      patch: {
        title?: string;
        type?: FlowNode["type"];
        position?: { x: number; y: number } | null;
        body?: string | null;
        speakerId?: string | null;
      };
    }
  | {
      type: "moveNode";
      id: string;
      position: { x: number; y: number };
    }
  | { type: "deleteNode"; id: string }
  | { type: "addEdge"; edge: FlowEdge }
  | {
      type: "updateEdge";
      id: string;
      patch: {
        from?: string;
        to?: string;
        condition?: string | null;
        effects?: string[] | null;
      };
    }
  | { type: "deleteEdge"; id: string }
  | { type: "addVariable"; variable: Variable }
  | {
      type: "updateVariable";
      id: string;
      patch: {
        name?: string;
        type?: Variable["type"];
        initial?: Variable["initial"] | null;
      };
    }
  | { type: "deleteVariable"; id: string }
  | { type: "addEntity"; entity: Entity }
  | {
      type: "updateEntity";
      id: string;
      patch: {
        name?: string;
        kind?: EntityKind;
        description?: string | null;
      };
    }
  | { type: "deleteEntity"; id: string };

export type EditorErrorCode =
  | "not-found"
  | "duplicate-id"
  | "invalid"
  | "dangling-reference";

export interface EditorError {
  code: EditorErrorCode;
  message: string;
}

export type ApplyResult =
  | { ok: true; state: EditorState }
  | { ok: false; error: EditorError };
