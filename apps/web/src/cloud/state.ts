import type { Project } from "@repo/schema";
import type { UserDto } from "../api/types.js";
import type { ProjectBinding } from "./types.js";

export type AuthState =
  | { kind: "unknown" }
  | { kind: "anonymous" }
  | { kind: "signedIn"; user: UserDto }
  | { kind: "offline" };

export type OperationKind =
  | "save"
  | "saveOverwrite"
  | "open"
  | "delete"
  | "list"
  | "auth";

export type OperationState =
  | { kind: "idle" }
  | { kind: "pending"; op: OperationKind }
  | { kind: "conflict"; currentVersion: number; snapshot: Project }
  | { kind: "notFound" }
  | { kind: "failed"; message: string; retryAfterSeconds?: number };

export interface CloudState {
  auth: AuthState;
  binding: ProjectBinding | null;
  operation: OperationState;
  generation: number;
}

export const initialCloudState: CloudState = {
  auth: { kind: "unknown" },
  binding: null,
  operation: { kind: "idle" },
  generation: 0,
};

export type CleanMarker =
  | { kind: "clean"; snapshot: Project }
  | { kind: "unbound" };

export function createCleanMarker(snapshot: Project): CleanMarker {
  return { kind: "clean", snapshot };
}

export function createUnboundMarker(): CleanMarker {
  return { kind: "unbound" };
}

export function isMarkerDirty(present: Project, marker: CleanMarker): boolean {
  if (marker.kind === "unbound") {
    return true;
  }
  return present !== marker.snapshot;
}

export function computeNextCleanMarker(sentSnapshot: Project): CleanMarker {
  return { kind: "clean", snapshot: sentSnapshot };
}

export type CloudAction =
  | { type: "startOperation"; op: OperationKind }
  | { type: "saveSucceeded"; binding: ProjectBinding; generation: number }
  | { type: "conflictOccurred"; currentVersion: number; snapshot: Project; generation: number }
  | { type: "conflictKeepMine" }
  | { type: "conflictCancel" }
  | { type: "saveNotFound"; generation: number }
  | { type: "operationFailed"; message: string; retryAfterSeconds?: number; generation: number }
  | { type: "dismissOperation" }
  | { type: "setAuth"; auth: AuthState }
  | { type: "replaceProject"; source: "local" | "cloud"; binding: ProjectBinding | null }
  | { type: "localFileSaved" }
  | { type: "projectUnbound" };

export function cloudReducer(state: CloudState, action: CloudAction): CloudState {
  switch (action.type) {
    case "startOperation": {
      // Only ONE operation pending at a time. Subsequent triggers are ignored.
      if (state.operation.kind !== "idle") {
        return state;
      }
      return {
        ...state,
        operation: { kind: "pending", op: action.op },
      };
    }

    case "saveSucceeded": {
      if (action.generation !== state.generation) {
        return state;
      }
      return {
        ...state,
        binding: action.binding,
        operation: { kind: "idle" },
      };
    }

    case "conflictOccurred": {
      if (action.generation !== state.generation) {
        return state;
      }
      return {
        ...state,
        operation: {
          kind: "conflict",
          currentVersion: action.currentVersion,
          snapshot: action.snapshot,
        },
      };
    }

    case "conflictKeepMine": {
      if (state.operation.kind !== "conflict") {
        return state;
      }
      return {
        ...state,
        operation: { kind: "pending", op: "saveOverwrite" },
      };
    }

    case "conflictCancel": {
      return {
        ...state,
        operation: { kind: "idle" },
      };
    }

    case "saveNotFound": {
      if (action.generation !== state.generation) {
        return state;
      }
      return {
        ...state,
        operation: { kind: "notFound" },
      };
    }

    case "operationFailed": {
      if (action.generation !== state.generation) {
        return state;
      }
      return {
        ...state,
        operation: {
          kind: "failed",
          message: action.message,
          retryAfterSeconds: action.retryAfterSeconds,
        },
      };
    }

    case "dismissOperation": {
      return {
        ...state,
        operation: { kind: "idle" },
      };
    }

    case "setAuth": {
      return {
        ...state,
        auth: action.auth,
      };
    }

    case "replaceProject": {
      return {
        ...state,
        generation: state.generation + 1,
        binding: action.source === "cloud" ? action.binding : null,
        operation: { kind: "idle" },
      };
    }

    case "localFileSaved": {
      // Local file save preserves cloud binding
      return state;
    }

    case "projectUnbound": {
      return {
        ...state,
        generation: state.generation + 1,
        binding: null,
        operation: { kind: "idle" },
      };
    }

    default: {
      return assertNever(action);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled union member: ${JSON.stringify(value)}`);
}
