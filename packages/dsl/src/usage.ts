import type { Effect, Expr, Identifier } from "./ast.js";

/**
 * Traverses an expression and collects all identifier read occurrences in source order.
 */
export function collectReads(expr: Expr): Identifier[] {
  const result: Identifier[] = [];

  function traverse(node: Expr): void {
    switch (node.type) {
      case "Identifier":
        result.push(node);
        break;
      case "Unary":
        traverse(node.operand);
        break;
      case "Binary":
        traverse(node.left);
        traverse(node.right);
        break;
      case "NumberLit":
      case "StringLit":
      case "BoolLit":
        break;
    }
  }

  traverse(expr);
  return result;
}

/**
 * Collects variable write and read identifiers for an effect statement.
 * Note: compound assignment operators (+=, -=) do not add the target identifier to reads.
 */
export function collectEffectUsage(effect: Effect): {
  write: Identifier;
  reads: Identifier[];
} {
  return {
    write: effect.target,
    reads: collectReads(effect.value),
  };
}
