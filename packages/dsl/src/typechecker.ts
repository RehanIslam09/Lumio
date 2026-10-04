import type { Variable, VariableType } from "@repo/schema";
import type { Expr, Effect } from "./ast.js";

export type Type = VariableType | "unknown";
export type TypeEnv = ReadonlyMap<string, VariableType>;

export interface TypeIssue {
  code: "undefined-variable" | "type-mismatch";
  message: string;
  start: number;
  end: number;
}

export function buildTypeEnv(variables: Variable[]): TypeEnv {
  const env = new Map<string, VariableType>();
  for (const v of variables) {
    if (!env.has(v.name)) {
      env.set(v.name, v.type);
    }
  }
  return env;
}

function sortIssues(issues: TypeIssue[]): TypeIssue[] {
  return [...issues].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.end - b.end;
  });
}

function checkExpr(expr: Expr, env: TypeEnv, issues: TypeIssue[]): Type {
  switch (expr.type) {
    case "NumberLit":
      return "number";
    case "StringLit":
      return "string";
    case "BoolLit":
      return "boolean";
    case "Identifier": {
      const existingType = env.get(expr.name);
      if (existingType !== undefined) {
        return existingType;
      }
      issues.push({
        code: "undefined-variable",
        message: `Undefined variable '${expr.name}'`,
        start: expr.start,
        end: expr.end,
      });
      return "unknown";
    }
    case "Unary": {
      const operandType = checkExpr(expr.operand, env, issues);
      if (operandType === "unknown") {
        return expr.op === "!" ? "boolean" : "number";
      }
      if (expr.op === "!") {
        if (operandType === "boolean") {
          return "boolean";
        }
        issues.push({
          code: "type-mismatch",
          message: `Operator '!' expects boolean, found ${operandType}`,
          start: expr.start,
          end: expr.end,
        });
        return "boolean";
      }
      if (expr.op === "-") {
        if (operandType === "number") {
          return "number";
        }
        issues.push({
          code: "type-mismatch",
          message: `Operator '-' expects number, found ${operandType}`,
          start: expr.start,
          end: expr.end,
        });
        return "number";
      }
      return "unknown";
    }
    case "Binary": {
      const leftType = checkExpr(expr.left, env, issues);
      const rightType = checkExpr(expr.right, env, issues);
      const hasUnknown = leftType === "unknown" || rightType === "unknown";

      switch (expr.op) {
        case "+": {
          if (hasUnknown) {
            return "unknown";
          }
          if (leftType === "number" && rightType === "number") {
            return "number";
          }
          if (leftType === "string" && rightType === "string") {
            return "string";
          }
          issues.push({
            code: "type-mismatch",
            message: `Operator '+' type mismatch: left is ${leftType}, right is ${rightType}`,
            start: expr.left.start,
            end: expr.right.end,
          });
          return "unknown";
        }
        case "-":
        case "*":
        case "/": {
          if (hasUnknown) {
            return "number";
          }
          if (leftType === "number" && rightType === "number") {
            return "number";
          }
          issues.push({
            code: "type-mismatch",
            message: `Operator '${expr.op}' type mismatch: left is ${leftType}, right is ${rightType}`,
            start: expr.left.start,
            end: expr.right.end,
          });
          return "number";
        }
        case "<":
        case "<=":
        case ">":
        case ">=": {
          if (hasUnknown) {
            return "boolean";
          }
          if (leftType === "number" && rightType === "number") {
            return "boolean";
          }
          issues.push({
            code: "type-mismatch",
            message: `Operator '${expr.op}' type mismatch: left is ${leftType}, right is ${rightType}`,
            start: expr.left.start,
            end: expr.right.end,
          });
          return "boolean";
        }
        case "==":
        case "!=": {
          if (hasUnknown) {
            return "boolean";
          }
          if (leftType === rightType) {
            return "boolean";
          }
          issues.push({
            code: "type-mismatch",
            message: `Operator '${expr.op}' type mismatch: left is ${leftType}, right is ${rightType}`,
            start: expr.left.start,
            end: expr.right.end,
          });
          return "boolean";
        }
        case "&&":
        case "||": {
          if (hasUnknown) {
            return "boolean";
          }
          if (leftType === "boolean" && rightType === "boolean") {
            return "boolean";
          }
          issues.push({
            code: "type-mismatch",
            message: `Operator '${expr.op}' type mismatch: left is ${leftType}, right is ${rightType}`,
            start: expr.left.start,
            end: expr.right.end,
          });
          return "boolean";
        }
      }
    }
  }
}

export function typecheckCondition(expr: Expr, env: TypeEnv): TypeIssue[] {
  const issues: TypeIssue[] = [];
  const finalType = checkExpr(expr, env, issues);
  if (finalType !== "unknown" && finalType !== "boolean") {
    issues.push({
      code: "type-mismatch",
      message: `Condition must be boolean, found ${finalType}`,
      start: expr.start,
      end: expr.end,
    });
  }
  return sortIssues(issues);
}

export function typecheckEffect(effect: Effect, env: TypeEnv): TypeIssue[] {
  const issues: TypeIssue[] = [];
  const targetName = effect.target.name;
  const targetType = env.get(targetName);

  if (targetType === undefined) {
    issues.push({
      code: "undefined-variable",
      message: `Undefined variable '${targetName}'`,
      start: effect.target.start,
      end: effect.target.end,
    });
  }

  const valueType = checkExpr(effect.value, env, issues);

  if (targetType !== undefined && valueType !== "unknown") {
    let compatible = false;

    if (effect.op === "=") {
      compatible = valueType === targetType;
    } else if (effect.op === "+=") {
      compatible =
        (targetType === "number" && valueType === "number") ||
        (targetType === "string" && valueType === "string");
    } else if (effect.op === "-=") {
      compatible = targetType === "number" && valueType === "number";
    }

    if (!compatible) {
      issues.push({
        code: "type-mismatch",
        message: `Operator '${effect.op}' cannot assign ${valueType} to ${targetType}`,
        start: effect.value.start,
        end: effect.value.end,
      });
    }
  }

  return sortIssues(issues);
}
