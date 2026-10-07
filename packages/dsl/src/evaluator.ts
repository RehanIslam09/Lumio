import type { Variable } from "@repo/schema";
import type { Expr, Effect } from "./ast.js";

export type Value = number | string | boolean;
export type VariableState = ReadonlyMap<string, Value>;

export type EvalErrorCode =
  | "undefined-variable"
  | "type-mismatch"
  | "division-by-zero"
  | "non-finite-number";

export interface EvalError {
  code: EvalErrorCode;
  message: string;
  start: number;
  end: number;
}

export type EvalResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: EvalError };

export type EffectResult =
  | { ok: true; state: ReadonlyMap<string, Value> }
  | { ok: false; error: EvalError };

/**
 * Constructs initial variable runtime state from variable definitions.
 * Duplicate names follow first-wins semantics.
 * Unspecified initial values receive type defaults (0, "", false).
 */
export function initialState(variables: readonly Variable[]): ReadonlyMap<string, Value> {
  const state = new Map<string, Value>();
  for (const v of variables) {
    if (!state.has(v.name)) {
      if (v.initial !== undefined) {
        state.set(v.name, v.initial);
      } else if (v.type === "number") {
        state.set(v.name, 0);
      } else if (v.type === "string") {
        state.set(v.name, "");
      } else if (v.type === "boolean") {
        state.set(v.name, false);
      }
    }
  }
  return state;
}

function checkFinite(val: number, start: number, end: number): EvalResult<number> {
  if (!Number.isFinite(val)) {
    return {
      ok: false,
      error: {
        code: "non-finite-number",
        message: "Result is not a finite number",
        start,
        end,
      },
    };
  }
  return { ok: true, value: val };
}

/**
 * Purely evaluates an expression AST against variable state.
 * Never throws. Reports first error encountered.
 * Strict type checking with no coercion.
 * Short-circuits && and ||.
 */
export function evaluateExpr(expr: Expr, state: VariableState): EvalResult<Value> {
  switch (expr.type) {
    case "NumberLit":
      return checkFinite(expr.value, expr.start, expr.end);

    case "StringLit":
      return { ok: true, value: expr.value };

    case "BoolLit":
      return { ok: true, value: expr.value };

    case "Identifier": {
      const val = state.get(expr.name);
      if (val === undefined) {
        return {
          ok: false,
          error: {
            code: "undefined-variable",
            message: `Undefined variable '${expr.name}'`,
            start: expr.start,
            end: expr.end,
          },
        };
      }
      return { ok: true, value: val };
    }

    case "Unary": {
      const opResult = evaluateExpr(expr.operand, state);
      if (!opResult.ok) return opResult;
      const operandVal = opResult.value;

      if (expr.op === "!") {
        if (typeof operandVal !== "boolean") {
          return {
            ok: false,
            error: {
              code: "type-mismatch",
              message: `Operator '!' expects boolean, found ${typeof operandVal}`,
              start: expr.start,
              end: expr.end,
            },
          };
        }
        return { ok: true, value: !operandVal };
      }

      if (expr.op === "-") {
        if (typeof operandVal !== "number") {
          return {
            ok: false,
            error: {
              code: "type-mismatch",
              message: `Operator '-' expects number, found ${typeof operandVal}`,
              start: expr.start,
              end: expr.end,
            },
          };
        }
        return checkFinite(-operandVal, expr.start, expr.end);
      }

      const exhaustive: never = expr.op;
      throw new Error(`Unexpected unary operator ${exhaustive}`);
    }

    case "Binary": {
      // Short-circuiting operators && and ||
      if (expr.op === "&&") {
        const leftRes = evaluateExpr(expr.left, state);
        if (!leftRes.ok) return leftRes;
        if (typeof leftRes.value !== "boolean") {
          return {
            ok: false,
            error: {
              code: "type-mismatch",
              message: `Operator '&&' expects boolean left operand, found ${typeof leftRes.value}`,
              start: expr.start,
              end: expr.end,
            },
          };
        }
        if (!leftRes.value) {
          return { ok: true, value: false };
        }
        const rightRes = evaluateExpr(expr.right, state);
        if (!rightRes.ok) return rightRes;
        if (typeof rightRes.value !== "boolean") {
          return {
            ok: false,
            error: {
              code: "type-mismatch",
              message: `Operator '&&' expects boolean right operand, found ${typeof rightRes.value}`,
              start: expr.start,
              end: expr.end,
            },
          };
        }
        return { ok: true, value: rightRes.value };
      }

      if (expr.op === "||") {
        const leftRes = evaluateExpr(expr.left, state);
        if (!leftRes.ok) return leftRes;
        if (typeof leftRes.value !== "boolean") {
          return {
            ok: false,
            error: {
              code: "type-mismatch",
              message: `Operator '||' expects boolean left operand, found ${typeof leftRes.value}`,
              start: expr.start,
              end: expr.end,
            },
          };
        }
        if (leftRes.value) {
          return { ok: true, value: true };
        }
        const rightRes = evaluateExpr(expr.right, state);
        if (!rightRes.ok) return rightRes;
        if (typeof rightRes.value !== "boolean") {
          return {
            ok: false,
            error: {
              code: "type-mismatch",
              message: `Operator '||' expects boolean right operand, found ${typeof rightRes.value}`,
              start: expr.start,
              end: expr.end,
            },
          };
        }
        return { ok: true, value: rightRes.value };
      }

      // Non-short-circuiting binary operators: evaluate both left and right
      const leftRes = evaluateExpr(expr.left, state);
      if (!leftRes.ok) return leftRes;

      const rightRes = evaluateExpr(expr.right, state);
      if (!rightRes.ok) return rightRes;

      const l = leftRes.value;
      const r = rightRes.value;

      switch (expr.op) {
        case "+": {
          if (typeof l === "number" && typeof r === "number") {
            return checkFinite(l + r, expr.start, expr.end);
          }
          if (typeof l === "string" && typeof r === "string") {
            return { ok: true, value: l + r };
          }
          return {
            ok: false,
            error: {
              code: "type-mismatch",
              message: `Operator '+' expects two numbers or two strings, found ${typeof l} and ${typeof r}`,
              start: expr.start,
              end: expr.end,
            },
          };
        }

        case "-": {
          if (typeof l !== "number" || typeof r !== "number") {
            return {
              ok: false,
              error: {
                code: "type-mismatch",
                message: `Operator '-' expects numbers, found ${typeof l} and ${typeof r}`,
                start: expr.start,
                end: expr.end,
              },
            };
          }
          return checkFinite(l - r, expr.start, expr.end);
        }

        case "*": {
          if (typeof l !== "number" || typeof r !== "number") {
            return {
              ok: false,
              error: {
                code: "type-mismatch",
                message: `Operator '*' expects numbers, found ${typeof l} and ${typeof r}`,
                start: expr.start,
                end: expr.end,
              },
            };
          }
          return checkFinite(l * r, expr.start, expr.end);
        }

        case "/": {
          if (typeof l !== "number" || typeof r !== "number") {
            return {
              ok: false,
              error: {
                code: "type-mismatch",
                message: `Operator '/' expects numbers, found ${typeof l} and ${typeof r}`,
                start: expr.start,
                end: expr.end,
              },
            };
          }
          if (r === 0) {
            return {
              ok: false,
              error: {
                code: "division-by-zero",
                message: "Division by zero",
                start: expr.start,
                end: expr.end,
              },
            };
          }
          return checkFinite(l / r, expr.start, expr.end);
        }

        case "<":
        case "<=":
        case ">":
        case ">=": {
          if (typeof l !== "number" || typeof r !== "number") {
            return {
              ok: false,
              error: {
                code: "type-mismatch",
                message: `Operator '${expr.op}' expects numbers, found ${typeof l} and ${typeof r}`,
                start: expr.start,
                end: expr.end,
              },
            };
          }
          let cmp = false;
          if (expr.op === "<") cmp = l < r;
          else if (expr.op === "<=") cmp = l <= r;
          else if (expr.op === ">") cmp = l > r;
          else if (expr.op === ">=") cmp = l >= r;
          return { ok: true, value: cmp };
        }

        case "==":
        case "!=": {
          if (typeof l !== typeof r) {
            return {
              ok: false,
              error: {
                code: "type-mismatch",
                message: `Operator '${expr.op}' requires operands of the same type, found ${typeof l} and ${typeof r}`,
                start: expr.start,
                end: expr.end,
              },
            };
          }
          const eq = l === r;
          return { ok: true, value: expr.op === "==" ? eq : !eq };
        }
      }
    }
  }
}

/**
 * Evaluates an edge condition.
 * Undefined or blank conditions evaluate to true.
 * A non-boolean expression result returns type-mismatch.
 */
export function evaluateCondition(
  expr: Expr | undefined,
  state: VariableState,
): EvalResult<boolean> {
  if (expr === undefined) {
    return { ok: true, value: true };
  }
  const res = evaluateExpr(expr, state);
  if (!res.ok) return res;
  if (typeof res.value !== "boolean") {
    return {
      ok: false,
      error: {
        code: "type-mismatch",
        message: `Condition must evaluate to boolean, found ${typeof res.value}`,
        start: expr.start,
        end: expr.end,
      },
    };
  }
  return { ok: true, value: res.value };
}

/**
 * Purely applies an effect to variable state.
 * Never mutates input state.
 * Target must exist in state.
 * Strict assignment types (=, +=, -=).
 */
export function applyEffect(effect: Effect, state: VariableState): EffectResult {
  const targetName = effect.target.name;
  const currentVal = state.get(targetName);

  if (currentVal === undefined) {
    return {
      ok: false,
      error: {
        code: "undefined-variable",
        message: `Undefined variable '${targetName}'`,
        start: effect.target.start,
        end: effect.target.end,
      },
    };
  }

  const valueRes = evaluateExpr(effect.value, state);
  if (!valueRes.ok) return valueRes;
  const val = valueRes.value;

  let nextVal: Value;

  if (effect.op === "=") {
    if (typeof val !== typeof currentVal) {
      return {
        ok: false,
        error: {
          code: "type-mismatch",
          message: `Cannot assign ${typeof val} to ${typeof currentVal}`,
          start: effect.value.start,
          end: effect.value.end,
        },
      };
    }
    nextVal = val;
  } else if (effect.op === "+=") {
    if (typeof currentVal === "number" && typeof val === "number") {
      const finiteRes = checkFinite(currentVal + val, effect.value.start, effect.value.end);
      if (!finiteRes.ok) return finiteRes;
      nextVal = finiteRes.value;
    } else if (typeof currentVal === "string" && typeof val === "string") {
      nextVal = currentVal + val;
    } else {
      return {
        ok: false,
        error: {
          code: "type-mismatch",
          message: `Operator '+=' requires (number, number) or (string, string), found ${typeof currentVal} and ${typeof val}`,
          start: effect.value.start,
          end: effect.value.end,
        },
      };
    }
  } else if (effect.op === "-=") {
    if (typeof currentVal !== "number" || typeof val !== "number") {
      return {
        ok: false,
        error: {
          code: "type-mismatch",
          message: `Operator '-=' requires numbers, found ${typeof currentVal} and ${typeof val}`,
          start: effect.value.start,
          end: effect.value.end,
        },
      };
    }
    const finiteRes = checkFinite(currentVal - val, effect.value.start, effect.value.end);
    if (!finiteRes.ok) return finiteRes;
    nextVal = finiteRes.value;
  } else {
    const exhaustive: never = effect.op;
    throw new Error(`Unexpected effect operator ${exhaustive}`);
  }

  const nextState = new Map(state);
  nextState.set(targetName, nextVal);
  return { ok: true, state: nextState };
}
