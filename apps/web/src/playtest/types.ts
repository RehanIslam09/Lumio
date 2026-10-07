import type { Project } from "@repo/schema";
import type { VariableState, Expr, Effect, ParseResult } from "@repo/dsl";

export type SessionStatus = "playing" | "ended" | "stuck" | "error";

export interface Step {
  readonly nodeId: string;
  readonly state: VariableState;
  readonly visits: ReadonlyMap<string, number>;
  readonly chosenEdgeId: string;
  readonly status: SessionStatus;
  readonly message?: string;
}

export interface Choice {
  readonly edgeId: string;
  readonly targetNodeId: string;
  readonly targetTitle: string | undefined;
  readonly status: "available" | "blocked" | "error";
  readonly reason?: string;
  readonly conditionText?: string;
}

export interface SessionParseCache {
  readonly conditions: Map<string, ParseResult<Expr>>;
  readonly effects: Map<string, ParseResult<Effect>>;
}

export interface Session {
  readonly project: Project;
  readonly startNodeId: string;
  readonly nodeId: string;
  readonly state: VariableState;
  readonly visits: ReadonlyMap<string, number>;
  readonly history: readonly Step[];
  readonly status: SessionStatus;
  readonly message?: string;
  readonly cache: SessionParseCache;
}

export interface StartSessionOptions {
  readonly startNodeId?: string;
}

export type StartSessionResult =
  | { readonly ok: true; readonly session: Session }
  | { readonly ok: false; readonly error: "no-start-node" };

export type ChooseResult =
  | { readonly ok: true; readonly session: Session }
  | { readonly ok: false; readonly error: string };
