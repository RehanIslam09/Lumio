import type { Variable } from "@repo/schema";
import {
  parseCondition,
  parseEffect,
  buildTypeEnv,
  typecheckCondition,
  typecheckEffect,
} from "@repo/dsl";

export type ProblemKind = "syntax" | "undefined-variable" | "type-mismatch";

export interface DraftProblem {
  kind: ProblemKind;
  message: string;
  start: number;
  end: number;
}

export interface DraftCheckResult {
  status: "empty" | "ok" | "error";
  problems: DraftProblem[];
}

function clampSpan(start: number, end: number, length: number): { start: number; end: number } {
  const s = Math.max(0, Math.min(length, start));
  const e = Math.max(s, Math.min(length, end));
  return { start: s, end: e };
}

/**
 * Validates a draft condition string against current variables.
 */
export function checkConditionDraft(
  source: string,
  variables: Variable[],
): DraftCheckResult {
  if (source.trim() === "") {
    return { status: "empty", problems: [] };
  }

  const parsed = parseCondition(source);
  if (!parsed.ok) {
    const span = clampSpan(parsed.error.start, parsed.error.end, source.length);
    return {
      status: "error",
      problems: [
        {
          kind: "syntax",
          message: parsed.error.message,
          start: span.start,
          end: span.end,
        },
      ],
    };
  }

  const env = buildTypeEnv(variables);
  const typeIssues = typecheckCondition(parsed.value, env);

  if (typeIssues.length === 0) {
    return { status: "ok", problems: [] };
  }

  return {
    status: "error",
    problems: typeIssues.map((issue) => {
      const span = clampSpan(issue.start, issue.end, source.length);
      return {
        kind: issue.code,
        message: issue.message,
        start: span.start,
        end: span.end,
      };
    }),
  };
}

/**
 * Validates a draft effect string against current variables.
 */
export function checkEffectDraft(
  source: string,
  variables: Variable[],
): DraftCheckResult {
  if (source.trim() === "") {
    return { status: "empty", problems: [] };
  }

  const parsed = parseEffect(source);
  if (!parsed.ok) {
    const span = clampSpan(parsed.error.start, parsed.error.end, source.length);
    return {
      status: "error",
      problems: [
        {
          kind: "syntax",
          message: parsed.error.message,
          start: span.start,
          end: span.end,
        },
      ],
    };
  }

  const env = buildTypeEnv(variables);
  const typeIssues = typecheckEffect(parsed.value, env);

  if (typeIssues.length === 0) {
    return { status: "ok", problems: [] };
  }

  return {
    status: "error",
    problems: typeIssues.map((issue) => {
      const span = clampSpan(issue.start, issue.end, source.length);
      return {
        kind: issue.code,
        message: issue.message,
        start: span.start,
        end: span.end,
      };
    }),
  };
}
