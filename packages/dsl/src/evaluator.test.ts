import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Variable } from "@repo/schema";
import { parseCondition, parseEffect } from "./parser.js";
import { typecheckCondition, buildTypeEnv } from "./typechecker.js";
import type { Expr } from "./ast.js";
import {
  initialState,
  evaluateExpr,
  evaluateCondition,
  applyEffect,
  type Value,
  type VariableState,
} from "./evaluator.js";

describe("initialState", () => {
  it("uses provided initial values when available", () => {
    const vars: Variable[] = [
      { id: "1", name: "hp", type: "number", initial: 100 },
      { id: "2", name: "name", type: "string", initial: "hero" },
      { id: "3", name: "alive", type: "boolean", initial: true },
    ];
    const state = initialState(vars);
    expect(state.get("hp")).toBe(100);
    expect(state.get("name")).toBe("hero");
    expect(state.get("alive")).toBe(true);
  });

  it("applies defaults when initial is omitted", () => {
    const vars: Variable[] = [
      { id: "1", name: "score", type: "number" },
      { id: "2", name: "tag", type: "string" },
      { id: "3", name: "flag", type: "boolean" },
    ];
    const state = initialState(vars);
    expect(state.get("score")).toBe(0);
    expect(state.get("tag")).toBe("");
    expect(state.get("flag")).toBe(false);
  });

  it("first wins on duplicate names", () => {
    const vars: Variable[] = [
      { id: "1", name: "x", type: "number", initial: 42 },
      { id: "2", name: "x", type: "number", initial: 99 },
    ];
    const state = initialState(vars);
    expect(state.get("x")).toBe(42);
    expect(state.size).toBe(1);
  });
});

describe("evaluateExpr", () => {
  const emptyState: VariableState = new Map();

  it("evaluates literals", () => {
    const num = parseCondition("123");
    if (!num.ok) throw new Error("parse failed");
    expect(evaluateExpr(num.value, emptyState)).toEqual({ ok: true, value: 123 });

    const str = parseCondition('"hello"');
    if (!str.ok) throw new Error("parse failed");
    expect(evaluateExpr(str.value, emptyState)).toEqual({ ok: true, value: "hello" });

    const bTrue = parseCondition("true");
    if (!bTrue.ok) throw new Error("parse failed");
    expect(evaluateExpr(bTrue.value, emptyState)).toEqual({ ok: true, value: true });

    const bFalse = parseCondition("false");
    if (!bFalse.ok) throw new Error("parse failed");
    expect(evaluateExpr(bFalse.value, emptyState)).toEqual({ ok: true, value: false });
  });

  it("evaluates identifiers from state and fails on undefined variables", () => {
    const state = new Map<string, Value>([["gold", 50]]);
    const parsed = parseCondition("gold");
    if (!parsed.ok) throw new Error("parse failed");
    expect(evaluateExpr(parsed.value, state)).toEqual({ ok: true, value: 50 });

    const missing = parseCondition("silver");
    if (!missing.ok) throw new Error("parse failed");
    const res = evaluateExpr(missing.value, state);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("undefined-variable");
      expect(res.error.message).toContain("silver");
      expect(res.error.start).toBe(0);
      expect(res.error.end).toBe(6);
    }
  });

  it("evaluates unary operators strictly", () => {
    const notTrue = parseCondition("!true");
    if (!notTrue.ok) throw new Error("parse failed");
    expect(evaluateExpr(notTrue.value, emptyState)).toEqual({ ok: true, value: false });

    const negNum = parseCondition("-42");
    if (!negNum.ok) throw new Error("parse failed");
    expect(evaluateExpr(negNum.value, emptyState)).toEqual({ ok: true, value: -42 });

    // Unary type mismatches
    const notNum = parseCondition("!42");
    if (!notNum.ok) throw new Error("parse failed");
    const r1 = evaluateExpr(notNum.value, emptyState);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe("type-mismatch");

    const negStr = parseCondition('-"text"');
    if (!negStr.ok) throw new Error("parse failed");
    const r2 = evaluateExpr(negStr.value, emptyState);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("type-mismatch");
  });

  it("evaluates binary arithmetic strictly", () => {
    const addNums = parseCondition("10 + 20");
    if (!addNums.ok) throw new Error("parse failed");
    expect(evaluateExpr(addNums.value, emptyState)).toEqual({ ok: true, value: 30 });

    const addStrs = parseCondition('"foo" + "bar"');
    if (!addStrs.ok) throw new Error("parse failed");
    expect(evaluateExpr(addStrs.value, emptyState)).toEqual({ ok: true, value: "foobar" });

    const sub = parseCondition("30 - 10");
    if (!sub.ok) throw new Error("parse failed");
    expect(evaluateExpr(sub.value, emptyState)).toEqual({ ok: true, value: 20 });

    const mul = parseCondition("5 * 6");
    if (!mul.ok) throw new Error("parse failed");
    expect(evaluateExpr(mul.value, emptyState)).toEqual({ ok: true, value: 30 });

    const div = parseCondition("20 / 4");
    if (!div.ok) throw new Error("parse failed");
    expect(evaluateExpr(div.value, emptyState)).toEqual({ ok: true, value: 5 });

    // Mismatches without coercion
    const addMixed = parseCondition('10 + "20"');
    if (!addMixed.ok) throw new Error("parse failed");
    const r1 = evaluateExpr(addMixed.value, emptyState);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe("type-mismatch");

    const subStr = parseCondition('"a" - "b"');
    if (!subStr.ok) throw new Error("parse failed");
    const r2 = evaluateExpr(subStr.value, emptyState);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("type-mismatch");
  });

  it("evaluates relational operators on numbers only", () => {
    const lt = parseCondition("5 < 10");
    if (!lt.ok) throw new Error("parse failed");
    expect(evaluateExpr(lt.value, emptyState)).toEqual({ ok: true, value: true });

    const gte = parseCondition("5 >= 5");
    if (!gte.ok) throw new Error("parse failed");
    expect(evaluateExpr(gte.value, emptyState)).toEqual({ ok: true, value: true });

    const ltStr = parseCondition('"a" < "b"');
    if (!ltStr.ok) throw new Error("parse failed");
    const r = evaluateExpr(ltStr.value, emptyState);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("type-mismatch");
  });

  it("evaluates equality strictly on same types with no coercion", () => {
    const eqNum = parseCondition("10 == 10");
    if (!eqNum.ok) throw new Error("parse failed");
    expect(evaluateExpr(eqNum.value, emptyState)).toEqual({ ok: true, value: true });

    const neqStr = parseCondition('"a" != "b"');
    if (!neqStr.ok) throw new Error("parse failed");
    expect(evaluateExpr(neqStr.value, emptyState)).toEqual({ ok: true, value: true });

    const eqBool = parseCondition("true == false");
    if (!eqBool.ok) throw new Error("parse failed");
    expect(evaluateExpr(eqBool.value, emptyState)).toEqual({ ok: true, value: false });

    // Equality between different types is a type-mismatch, not false!
    const eqCross = parseCondition('10 == "10"');
    if (!eqCross.ok) throw new Error("parse failed");
    const r1 = evaluateExpr(eqCross.value, emptyState);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe("type-mismatch");

    const neqCross = parseCondition("false != 0");
    if (!neqCross.ok) throw new Error("parse failed");
    const r2 = evaluateExpr(neqCross.value, emptyState);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("type-mismatch");
  });

  it("handles division by zero and non-finite numbers", () => {
    const divZero = parseCondition("10 / 0");
    if (!divZero.ok) throw new Error("parse failed");
    const r1 = evaluateExpr(divZero.value, emptyState);
    expect(r1.ok).toBe(false);
    if (!r1.ok) {
      expect(r1.error.code).toBe("division-by-zero");
      expect(r1.error.message).toContain("Division by zero");
    }

    const divNegZero = parseCondition("10 / -0");
    if (!divNegZero.ok) throw new Error("parse failed");
    const r2 = evaluateExpr(divNegZero.value, emptyState);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("division-by-zero");
  });

  it("handles -0 and 0 arithmetic", () => {
    const zeroAdd = parseCondition("0 + 0");
    if (!zeroAdd.ok) throw new Error("parse failed");
    const res = evaluateExpr(zeroAdd.value, emptyState);
    expect(res.ok).toBe(true);
    if (res.ok) expect(Object.is(res.value, 0)).toBe(true);

    const negZero = parseCondition("-0");
    if (!negZero.ok) throw new Error("parse failed");
    const resNeg = evaluateExpr(negZero.value, emptyState);
    expect(resNeg.ok).toBe(true);
    if (resNeg.ok) expect(Object.is(resNeg.value, -0)).toBe(true);
  });

  it("short-circuits && and || so right side errors are not evaluated", () => {
    // Amendment 2: false && ghost must return false with no error
    const andShort = parseCondition("false && ghost");
    if (!andShort.ok) throw new Error("parse failed");
    expect(evaluateExpr(andShort.value, emptyState)).toEqual({ ok: true, value: false });

    // true || ghost must return true with no error
    const orShort = parseCondition("true || ghost");
    if (!orShort.ok) throw new Error("parse failed");
    expect(evaluateExpr(orShort.value, emptyState)).toEqual({ ok: true, value: true });

    // true && ghost MUST report undefined variable
    const andEval = parseCondition("true && ghost");
    if (!andEval.ok) throw new Error("parse failed");
    const r1 = evaluateExpr(andEval.value, emptyState);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe("undefined-variable");

    // false && (1 / 0 > 1) returns false with no division-by-zero error
    const divShort = parseCondition("false && (1 / 0 > 1)");
    if (!divShort.ok) throw new Error("parse failed");
    expect(evaluateExpr(divShort.value, emptyState)).toEqual({ ok: true, value: false });

    // true || (1 / 0 > 1) returns true
    const orDivShort = parseCondition("true || (1 / 0 > 1)");
    if (!orDivShort.ok) throw new Error("parse failed");
    expect(evaluateExpr(orDivShort.value, emptyState)).toEqual({ ok: true, value: true });

    // Left operand must still be boolean: 0 && true is a type-mismatch
    const numAnd = parseCondition("0 && true");
    if (!numAnd.ok) throw new Error("parse failed");
    const r2 = evaluateExpr(numAnd.value, emptyState);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("type-mismatch");
  });
});

describe("evaluateCondition", () => {
  const emptyState: VariableState = new Map();

  it("returns true for blank or undefined condition", () => {
    expect(evaluateCondition(undefined, emptyState)).toEqual({ ok: true, value: true });
  });

  it("evaluates boolean conditions", () => {
    const condTrue = parseCondition("5 > 3");
    if (!condTrue.ok) throw new Error("parse failed");
    expect(evaluateCondition(condTrue.value, emptyState)).toEqual({ ok: true, value: true });

    const condFalse = parseCondition("5 < 3");
    if (!condFalse.ok) throw new Error("parse failed");
    expect(evaluateCondition(condFalse.value, emptyState)).toEqual({ ok: true, value: false });
  });

  it("returns type-mismatch if condition result is not a boolean", () => {
    const numCond = parseCondition("42");
    if (!numCond.ok) throw new Error("parse failed");
    const res = evaluateCondition(numCond.value, emptyState);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("type-mismatch");
      expect(res.error.start).toBe(numCond.value.start);
      expect(res.error.end).toBe(numCond.value.end);
    }
  });
});

describe("applyEffect", () => {
  it("applies = assignment when types match", () => {
    const state = new Map<string, Value>([["gold", 10]]);
    const eff = parseEffect("gold = 25");
    if (!eff.ok) throw new Error("parse failed");
    const res = applyEffect(eff.value, state);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.get("gold")).toBe(25);
      expect(state.get("gold")).toBe(10); // Not mutated!
    }
  });

  it("applies += and -= correctly without mutating input state", () => {
    const state = new Map<string, Value>([
      ["count", 10],
      ["prefix", "hello"],
    ]);

    const effAdd = parseEffect("count += 5");
    if (!effAdd.ok) throw new Error("parse failed");
    const r1 = applyEffect(effAdd.value, state);
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.state.get("count")).toBe(15);
      expect(state.get("count")).toBe(10);
    }

    const effSub = parseEffect("count -= 3");
    if (!effSub.ok) throw new Error("parse failed");
    const r2 = applyEffect(effSub.value, state);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.state.get("count")).toBe(7);
      expect(state.get("count")).toBe(10);
    }

    const effConcat = parseEffect('prefix += " world"');
    if (!effConcat.ok) throw new Error("parse failed");
    const r3 = applyEffect(effConcat.value, state);
    expect(r3.ok).toBe(true);
    if (r3.ok) {
      expect(r3.state.get("prefix")).toBe("hello world");
      expect(state.get("prefix")).toBe("hello");
    }
  });

  it("rejects assignment if target is undefined in state", () => {
    const state = new Map<string, Value>();
    const eff = parseEffect("unknownVar = 10");
    if (!eff.ok) throw new Error("parse failed");
    const res = applyEffect(eff.value, state);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("undefined-variable");
      expect(res.error.start).toBe(eff.value.target.start);
      expect(res.error.end).toBe(eff.value.target.end);
    }
  });

  it("rejects mismatched type assignment", () => {
    const state = new Map<string, Value>([["gold", 10]]);
    const eff = parseEffect('gold = "rich"');
    if (!eff.ok) throw new Error("parse failed");
    const res = applyEffect(eff.value, state);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("type-mismatch");
      expect(res.error.start).toBe(eff.value.value.start);
      expect(res.error.end).toBe(eff.value.value.end);
    }
  });

  it("rejects invalid compound operator types", () => {
    const state = new Map<string, Value>([
      ["name", "alice"],
      ["flag", true],
    ]);

    const effSubStr = parseEffect('name -= "ice"');
    if (!effSubStr.ok) throw new Error("parse failed");
    const r1 = applyEffect(effSubStr.value, state);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe("type-mismatch");

    const effAddBool = parseEffect("flag += true");
    if (!effAddBool.ok) throw new Error("parse failed");
    const r2 = applyEffect(effAddBool.value, state);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("type-mismatch");
  });
});

// --- Property Tests ---
describe("Property Tests", () => {
  // Generator for typed expressions
  function arbType(): fc.Arbitrary<"number" | "string" | "boolean"> {
    return fc.constantFrom("number", "string", "boolean");
  }

  function arbTypedExpr(
    type: "number" | "string" | "boolean",
    depth: number,
    allowDiv = true,
  ): fc.Arbitrary<Expr> {
    if (depth <= 0) {
      if (type === "number") {
        return fc.integer({ min: -100, max: 100 }).map((val) => ({
          type: "NumberLit" as const,
          value: val,
          start: 0,
          end: 1,
        }));
      }
      if (type === "string") {
        return fc.stringMatching(/^[a-z]{0,5}$/).map((val) => ({
          type: "StringLit" as const,
          value: val,
          start: 0,
          end: 1,
        }));
      }
      return fc.boolean().map((val) => ({
        type: "BoolLit" as const,
        value: val,
        start: 0,
        end: 1,
      }));
    }

    if (type === "number") {
      const ops: Array<"+" | "-" | "*" | "/"> = allowDiv ? ["+", "-", "*", "/"] : ["+", "-", "*"];
      const binaryArb = fc
        .tuple(
          arbTypedExpr("number", depth - 1, allowDiv),
          fc.constantFrom(...ops),
          arbTypedExpr("number", depth - 1, allowDiv),
        )
        .map(([left, op, right]) => ({
          type: "Binary" as const,
          op,
          left,
          right,
          start: 0,
          end: 1,
        }));

      const unaryArb = arbTypedExpr("number", depth - 1, allowDiv).map((operand) => ({
        type: "Unary" as const,
        op: "-" as const,
        operand,
        start: 0,
        end: 1,
      }));

      return fc.oneof(binaryArb, unaryArb);
    }

    if (type === "string") {
      return fc
        .tuple(arbTypedExpr("string", depth - 1, allowDiv), arbTypedExpr("string", depth - 1, allowDiv))
        .map(([left, right]) => ({
          type: "Binary" as const,
          op: "+" as const,
          left,
          right,
          start: 0,
          end: 1,
        }));
    }

    // boolean
    const logicArb = fc
      .tuple(
        arbTypedExpr("boolean", depth - 1, allowDiv),
        fc.constantFrom("&&" as const, "||" as const),
        arbTypedExpr("boolean", depth - 1, allowDiv),
      )
      .map(([left, op, right]) => ({
        type: "Binary" as const,
        op,
        left,
        right,
        start: 0,
        end: 1,
      }));

    const notArb = arbTypedExpr("boolean", depth - 1, allowDiv).map((operand) => ({
      type: "Unary" as const,
      op: "!" as const,
      operand,
      start: 0,
      end: 1,
    }));

    const cmpNumArb = fc
      .tuple(
        arbTypedExpr("number", depth - 1, allowDiv),
        fc.constantFrom("<" as const, "<=" as const, ">" as const, ">=" as const),
        arbTypedExpr("number", depth - 1, allowDiv),
      )
      .map(([left, op, right]) => ({
        type: "Binary" as const,
        op,
        left,
        right,
        start: 0,
        end: 1,
      }));

    const eqNumArb = fc
      .tuple(
        arbTypedExpr("number", depth - 1, allowDiv),
        fc.constantFrom("==" as const, "!=" as const),
        arbTypedExpr("number", depth - 1, allowDiv),
      )
      .map(([left, op, right]) => ({
        type: "Binary" as const,
        op,
        left,
        right,
        start: 0,
        end: 1,
      }));

    return fc.oneof(logicArb, notArb, cmpNumArb, eqNumArb);
  }

  it("PROPERTY T4 (type soundness): well-typed expression never produces undefined-variable or type-mismatch", () => {
    fc.assert(
      fc.property(
        arbType().chain((type) => fc.tuple(fc.constant(type), arbTypedExpr(type, 3, true))),
        ([expectedType, expr]) => {
          if (expectedType === "boolean") {
            const issues = typecheckCondition(expr, buildTypeEnv([]));
            expect(issues).toHaveLength(0);
          }
          const state: VariableState = new Map();
          const res = evaluateExpr(expr, state);
          if (res.ok) {
            expect(typeof res.value).toBe(expectedType);
          } else {
            // May only fail with division-by-zero or non-finite-number
            expect(["division-by-zero", "non-finite-number"]).toContain(res.error.code);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Tiny independent interpreter for Property T5 (excluding division)
  function miniEval(expr: Expr): Value {
    switch (expr.type) {
      case "NumberLit":
      case "StringLit":
      case "BoolLit":
        return expr.value;
      case "Identifier":
        throw new Error("Identifier not expected in T5 generator");
      case "Unary": {
        const val = miniEval(expr.operand);
        if (expr.op === "!") return !val;
        if (expr.op === "-") return -(val as number);
        throw new Error(`unknown unary op ${expr.op}`);
      }
      case "Binary": {
        if (expr.op === "&&") {
          const l = miniEval(expr.left) as boolean;
          return l ? (miniEval(expr.right) as boolean) : false;
        }
        if (expr.op === "||") {
          const l = miniEval(expr.left) as boolean;
          return l ? true : (miniEval(expr.right) as boolean);
        }
        const l = miniEval(expr.left);
        const r = miniEval(expr.right);
        switch (expr.op) {
          case "+":
            if (typeof l === "number" && typeof r === "number") return l + r;
            if (typeof l === "string" && typeof r === "string") return l + r;
            throw new Error("invalid operands for + in miniEval");
          case "-":
            return (l as number) - (r as number);
          case "*":
            return (l as number) * (r as number);
          case "<":
            return (l as number) < (r as number);
          case "<=":
            return (l as number) <= (r as number);
          case ">":
            return (l as number) > (r as number);
          case ">=":
            return (l as number) >= (r as number);
          case "==":
            return l === r;
          case "!=":
            return l !== r;
          default:
            throw new Error(`unhandled op ${expr.op}`);
        }
      }
    }
  }

  it("PROPERTY T5 (oracle): value equals tiny independent interpreter for non-division well-typed exprs", () => {
    fc.assert(
      fc.property(
        arbType().chain((type) => arbTypedExpr(type, 3, false)),
        (expr) => {
          const expected = miniEval(expr);
          const state: VariableState = new Map();
          const actual = evaluateExpr(expr, state);
          expect(actual.ok).toBe(true);
          if (actual.ok) {
            expect(Object.is(actual.value, expected)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("PROPERTY T6 (no crash): evaluateExpr and applyEffect never throw for arbitrary validly parsed ASTs", () => {
    // Generate random identifiers and state
    const varNames = ["a", "b", "c", "x", "y"];
    const arbVal: fc.Arbitrary<Value> = fc.oneof(
      fc.integer({ min: -50, max: 50 }),
      fc.string({ maxLength: 5 }),
      fc.boolean(),
    );
    const arbState: fc.Arbitrary<VariableState> = fc
      .array(fc.tuple(fc.constantFrom(...varNames), arbVal))
      .map((entries) => new Map(entries));

    // Arbitrary expressions with variable reads
    function arbAnyExpr(depth: number): fc.Arbitrary<Expr> {
      if (depth <= 0) {
        return fc.oneof(
          fc.integer({ min: -10, max: 10 }).map((value) => ({
            type: "NumberLit" as const,
            value,
            start: 0,
            end: 1,
          })),
          fc.string({ maxLength: 4 }).map((value) => ({
            type: "StringLit" as const,
            value,
            start: 0,
            end: 1,
          })),
          fc.boolean().map((value) => ({
            type: "BoolLit" as const,
            value,
            start: 0,
            end: 1,
          })),
          fc.constantFrom(...varNames, "undefinedVar").map((name) => ({
            type: "Identifier" as const,
            name,
            start: 0,
            end: 1,
          })),
        );
      }
      return fc.oneof(
        fc
          .tuple(
            arbAnyExpr(depth - 1),
            fc.constantFrom(
              "+" as const,
              "-" as const,
              "*" as const,
              "/" as const,
              "<" as const,
              "<=" as const,
              ">" as const,
              ">=" as const,
              "==" as const,
              "!=" as const,
              "&&" as const,
              "||" as const,
            ),
            arbAnyExpr(depth - 1),
          )
          .map(([left, op, right]) => ({
            type: "Binary" as const,
            op,
            left,
            right,
            start: 0,
            end: 1,
          })),
        fc
          .tuple(fc.constantFrom("!" as const, "-" as const), arbAnyExpr(depth - 1))
          .map(([op, operand]) => ({
            type: "Unary" as const,
            op,
            operand,
            start: 0,
            end: 1,
          })),
      );
    }

    fc.assert(
      fc.property(arbAnyExpr(3), arbState, (expr, state) => {
        expect(() => evaluateExpr(expr, state)).not.toThrow();
        expect(() => evaluateCondition(expr, state)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });
});
