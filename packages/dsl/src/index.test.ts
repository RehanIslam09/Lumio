import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { Expr } from "./ast.js";
import { parseCondition, parseEffect } from "./index.js";

function stripSpans(expr: Expr): unknown {
  switch (expr.type) {
    case "NumberLit":
      return { type: "NumberLit", value: expr.value };
    case "StringLit":
      return { type: "StringLit", value: expr.value };
    case "BoolLit":
      return { type: "BoolLit", value: expr.value };
    case "Identifier":
      return { type: "Identifier", name: expr.name };
    case "Unary":
      return {
        type: "Unary",
        op: expr.op,
        operand: stripSpans(expr.operand),
      };
    case "Binary":
      return {
        type: "Binary",
        op: expr.op,
        left: stripSpans(expr.left),
        right: stripSpans(expr.right),
      };
  }
}

function printExprFullyParenthesized(expr: Expr): string {
  switch (expr.type) {
    case "NumberLit":
      return String(expr.value);
    case "StringLit": {
      const escaped = expr.value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
      return `"${escaped}"`;
    }
    case "BoolLit":
      return expr.value ? "true" : "false";
    case "Identifier":
      return expr.name;
    case "Unary":
      return `(${expr.op}${printExprFullyParenthesized(expr.operand)})`;
    case "Binary":
      return `(${printExprFullyParenthesized(expr.left)} ${expr.op} ${printExprFullyParenthesized(expr.right)})`;
  }
}

describe("parseCondition - unit tests", () => {
  it("literal kinds: parses NumberLit, StringLit, BoolLit, and Identifier", () => {
    const numInt = parseCondition("42");
    expect(numInt).toEqual({
      ok: true,
      value: { type: "NumberLit", value: 42, start: 0, end: 2 },
    });

    const numDec = parseCondition("3.14");
    expect(numDec).toEqual({
      ok: true,
      value: { type: "NumberLit", value: 3.14, start: 0, end: 4 },
    });

    const str = parseCondition('"hello"');
    expect(str).toEqual({
      ok: true,
      value: { type: "StringLit", value: "hello", start: 0, end: 7 },
    });

    const boolTrue = parseCondition("true");
    expect(boolTrue).toEqual({
      ok: true,
      value: { type: "BoolLit", value: true, start: 0, end: 4 },
    });

    const boolFalse = parseCondition("false");
    expect(boolFalse).toEqual({
      ok: true,
      value: { type: "BoolLit", value: false, start: 0, end: 5 },
    });

    const id = parseCondition("player_gold");
    expect(id).toEqual({
      ok: true,
      value: { type: "Identifier", name: "player_gold", start: 0, end: 11 },
    });
  });

  it("precedence: or (||) vs and (&&)", () => {
    const res = parseCondition("a || b && c");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual({
      type: "Binary",
      op: "||",
      start: 0,
      end: 11,
      left: { type: "Identifier", name: "a", start: 0, end: 1 },
      right: {
        type: "Binary",
        op: "&&",
        start: 5,
        end: 11,
        left: { type: "Identifier", name: "b", start: 5, end: 6 },
        right: { type: "Identifier", name: "c", start: 10, end: 11 },
      },
    });
  });

  it("precedence: and (&&) vs equality (==)", () => {
    const res = parseCondition("a && b == c");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual({
      type: "Binary",
      op: "&&",
      start: 0,
      end: 11,
      left: { type: "Identifier", name: "a", start: 0, end: 1 },
      right: {
        type: "Binary",
        op: "==",
        start: 5,
        end: 11,
        left: { type: "Identifier", name: "b", start: 5, end: 6 },
        right: { type: "Identifier", name: "c", start: 10, end: 11 },
      },
    });
  });

  it("precedence: equality (!=) vs relational (<=)", () => {
    const res = parseCondition("a != b <= c");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual({
      type: "Binary",
      op: "!=",
      start: 0,
      end: 11,
      left: { type: "Identifier", name: "a", start: 0, end: 1 },
      right: {
        type: "Binary",
        op: "<=",
        start: 5,
        end: 11,
        left: { type: "Identifier", name: "b", start: 5, end: 6 },
        right: { type: "Identifier", name: "c", start: 10, end: 11 },
      },
    });
  });

  it("precedence: relational (>) vs additive (+)", () => {
    const res = parseCondition("a > b + c");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual({
      type: "Binary",
      op: ">",
      start: 0,
      end: 9,
      left: { type: "Identifier", name: "a", start: 0, end: 1 },
      right: {
        type: "Binary",
        op: "+",
        start: 4,
        end: 9,
        left: { type: "Identifier", name: "b", start: 4, end: 5 },
        right: { type: "Identifier", name: "c", start: 8, end: 9 },
      },
    });
  });

  it("precedence: additive (-) vs term (*)", () => {
    const res = parseCondition("a - b * c");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual({
      type: "Binary",
      op: "-",
      start: 0,
      end: 9,
      left: { type: "Identifier", name: "a", start: 0, end: 1 },
      right: {
        type: "Binary",
        op: "*",
        start: 4,
        end: 9,
        left: { type: "Identifier", name: "b", start: 4, end: 5 },
        right: { type: "Identifier", name: "c", start: 8, end: 9 },
      },
    });
  });

  it("precedence: term (/) vs unary (-)", () => {
    const res = parseCondition("a / -b");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual({
      type: "Binary",
      op: "/",
      start: 0,
      end: 6,
      left: { type: "Identifier", name: "a", start: 0, end: 1 },
      right: {
        type: "Unary",
        op: "-",
        start: 4,
        end: 6,
        operand: { type: "Identifier", name: "b", start: 5, end: 6 },
      },
    });
  });

  it("left associativity: 1 - 2 - 3 is ((1 - 2) - 3)", () => {
    const res = parseCondition("1 - 2 - 3");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual({
      type: "Binary",
      op: "-",
      start: 0,
      end: 9,
      left: {
        type: "Binary",
        op: "-",
        start: 0,
        end: 5,
        left: { type: "NumberLit", value: 1, start: 0, end: 1 },
        right: { type: "NumberLit", value: 2, start: 4, end: 5 },
      },
      right: { type: "NumberLit", value: 3, start: 8, end: 9 },
    });
  });

  it("unary chains: !!a and - -1", () => {
    const resBang = parseCondition("!!a");
    expect(resBang).toEqual({
      ok: true,
      value: {
        type: "Unary",
        op: "!",
        start: 0,
        end: 3,
        operand: {
          type: "Unary",
          op: "!",
          start: 1,
          end: 3,
          operand: { type: "Identifier", name: "a", start: 2, end: 3 },
        },
      },
    });

    const resMinus = parseCondition("- -1");
    expect(resMinus).toEqual({
      ok: true,
      value: {
        type: "Unary",
        op: "-",
        start: 0,
        end: 4,
        operand: {
          type: "Unary",
          op: "-",
          start: 2,
          end: 4,
          operand: { type: "NumberLit", value: 1, start: 3, end: 4 },
        },
      },
    });
  });

  it("parentheses override precedence and retain inner node span", () => {
    const res = parseCondition("(a + b) * c");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual({
      type: "Binary",
      op: "*",
      start: 1,
      end: 11,
      left: {
        type: "Binary",
        op: "+",
        start: 1,
        end: 6,
        left: { type: "Identifier", name: "a", start: 1, end: 2 },
        right: { type: "Identifier", name: "b", start: 5, end: 6 },
      },
      right: { type: "Identifier", name: "c", start: 10, end: 11 },
    });
  });

  it('string escapes: \\" and \\\\', () => {
    const res = parseCondition('"hello \\"world\\" \\\\ test"');
    expect(res).toEqual({
      ok: true,
      value: {
        type: "StringLit",
        value: 'hello "world" \\ test',
        start: 0,
        end: 25,
      },
    });
  });
});

describe("parseEffect - unit tests", () => {
  it("each effect operator: =, +=, -=", () => {
    const eq = parseEffect("x = 10");
    expect(eq).toEqual({
      ok: true,
      value: {
        target: { type: "Identifier", name: "x", start: 0, end: 1 },
        op: "=",
        value: { type: "NumberLit", value: 10, start: 4, end: 6 },
        start: 0,
        end: 6,
      },
    });

    const plusEq = parseEffect("hp += 5");
    expect(plusEq).toEqual({
      ok: true,
      value: {
        target: { type: "Identifier", name: "hp", start: 0, end: 2 },
        op: "+=",
        value: { type: "NumberLit", value: 5, start: 6, end: 7 },
        start: 0,
        end: 7,
      },
    });

    const minusEq = parseEffect("gold -= cost + 2");
    expect(minusEq).toEqual({
      ok: true,
      value: {
        target: { type: "Identifier", name: "gold", start: 0, end: 4 },
        op: "-=",
        value: {
          type: "Binary",
          op: "+",
          start: 8,
          end: 16,
          left: { type: "Identifier", name: "cost", start: 8, end: 12 },
          right: { type: "NumberLit", value: 2, start: 15, end: 16 },
        },
        start: 0,
        end: 16,
      },
    });
  });
});

describe("error span conventions", () => {
  it("unexpected character: [i, i+1)", () => {
    const res = parseCondition("a @ b");
    expect(res).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("unexpected character"),
        start: 2,
        end: 3,
      },
    });
  });

  it("unterminated string: [index of opening quote, source.length)", () => {
    const res = parseCondition('"hello');
    expect(res).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("unterminated string"),
        start: 0,
        end: 6,
      },
    });
  });

  it('invalid escape such as "\\n": [index of backslash, index+2)', () => {
    const res = parseCondition('"a\\nb"');
    expect(res).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("invalid escape"),
        start: 2,
        end: 4,
      },
    });
  });

  it('unexpected end of input: missing ")": [source.length, source.length)', () => {
    const res = parseCondition("(1 + 2");
    expect(res).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("unexpected end of input"),
        start: 6,
        end: 6,
      },
    });
  });

  it('unexpected end of input: "1 +": [source.length, source.length)', () => {
    const res = parseCondition("1 +");
    expect(res).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("unexpected end of input"),
        start: 3,
        end: 3,
      },
    });
  });

  it("unexpected end of input: empty or whitespace-only input: [source.length, source.length)", () => {
    const empty = parseCondition("");
    expect(empty).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("unexpected end of input"),
        start: 0,
        end: 0,
      },
    });

    const ws = parseCondition("   ");
    expect(ws).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("unexpected end of input"),
        start: 3,
        end: 3,
      },
    });
  });

  it('trailing tokens or unexpected token (e.g. "=" inside condition): span of that token', () => {
    const eqInCond = parseCondition("a = b");
    expect(eqInCond).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("unexpected"),
        start: 2,
        end: 3,
      },
    });

    const unexpToken = parseCondition("1 + )");
    expect(unexpToken).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("unexpected"),
        start: 4,
        end: 5,
      },
    });
  });

  it("effect target not an identifier: span of the first token", () => {
    const numTarget = parseEffect("1 = 2");
    expect(numTarget).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("identifier"),
        start: 0,
        end: 1,
      },
    });

    const parenTarget = parseEffect("(a) = 1");
    expect(parenTarget).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("identifier"),
        start: 0,
        end: 1,
      },
    });
  });

  it("effect with missing or wrong operator: span of offending token or [len, len) if absent", () => {
    const wrongOp = parseEffect("a + 1");
    expect(wrongOp).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("operator"),
        start: 2,
        end: 3,
      },
    });

    const missingOp = parseEffect("a");
    expect(missingOp).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("operator"),
        start: 1,
        end: 1,
      },
    });
  });

  it('numbers: "3." and ".5" are errors because "." is an unexpected character', () => {
    const trailingDot = parseCondition("3.");
    expect(trailingDot).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("unexpected character"),
        start: 1,
        end: 2,
      },
    });

    const leadingDot = parseCondition(".5");
    expect(leadingDot).toEqual({
      ok: false,
      error: {
        message: expect.stringContaining("unexpected character"),
        start: 0,
        end: 1,
      },
    });
  });
});

describe("nesting limit", () => {
  it("depth 200 parses successfully", () => {
    const src = "(".repeat(200) + "1" + ")".repeat(200);
    const res = parseCondition(src);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.type).toBe("NumberLit");
  });

  it("depth 201 errors with 'expression nested too deeply' without throwing", () => {
    const src = "(".repeat(201) + "1" + ")".repeat(201);
    const res = parseCondition(src);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toBe("expression nested too deeply");
    expect(res.error.start).toBe(200);
    expect(res.error.end).toBe(201);
  });

  it("100000-character string of '(' returns ParseError without throwing RangeError", () => {
    const src = "(".repeat(100_000);
    expect(() => {
      const res = parseCondition(src);
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.message).toBe("expression nested too deeply");
      expect(res.error.start).toBe(200);
      expect(res.error.end).toBe(201);
    }).not.toThrow();
  });
});

describe("property tests", () => {
  const identifierArbitrary = fc
    .tuple(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_".split(""),
      ),
      fc.stringMatching(/^[A-Za-z0-9_]{0,10}$/),
    )
    .map(([head, tail]) => head + tail)
    .filter((id) => id !== "true" && id !== "false");

  const numberArbitrary = fc.oneof(
    fc.integer({ min: 0, max: 1000 }),
    fc.tuple(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 99 })).map(
      ([intPart, fracPart]) => Number(`${intPart}.${String(fracPart).padStart(2, "0")}`),
    ),
  );

  const stringArbitrary = fc
    .array(
      fc.oneof(
        fc.constantFrom(
          ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _+-/*=<>!(),".split(""),
        ),
        fc.constant('"'),
        fc.constant("\\"),
      ),
      { maxLength: 20 },
    )
    .map((chars) => chars.join(""));


  const leafExprArbitrary: fc.Arbitrary<Expr> = fc.oneof(
    numberArbitrary.map((value) => ({
      type: "NumberLit" as const,
      value,
      start: 0,
      end: 0,
    })),
    stringArbitrary.map((value) => ({
      type: "StringLit" as const,
      value,
      start: 0,
      end: 0,
    })),
    fc.boolean().map((value) => ({
      type: "BoolLit" as const,
      value,
      start: 0,
      end: 0,
    })),
    identifierArbitrary.map((name) => ({
      type: "Identifier" as const,
      name,
      start: 0,
      end: 0,
    })),
  );

  const exprArbitrary: fc.Arbitrary<Expr> = fc.letrec((tie) => ({
    expr: fc.oneof(
      { depthSize: "small", withCrossShrink: true },
      leafExprArbitrary,
      fc.record({
        type: fc.constant("Unary" as const),
        op: fc.constantFrom("!" as const, "-" as const),
        operand: tie("expr") as fc.Arbitrary<Expr>,
        start: fc.constant(0),
        end: fc.constant(0),
      }),
      fc.record({
        type: fc.constant("Binary" as const),
        op: fc.constantFrom(
          "||" as const,
          "&&" as const,
          "==" as const,
          "!=" as const,
          "<" as const,
          "<=" as const,
          ">" as const,
          ">=" as const,
          "+" as const,
          "-" as const,
          "*" as const,
          "/" as const,
        ),
        left: tie("expr") as fc.Arbitrary<Expr>,
        right: tie("expr") as fc.Arbitrary<Expr>,
        start: fc.constant(0),
        end: fc.constant(0),
      }),
    ),
  })).expr;

  it("Property 1 (round trip): fully parenthesized printed Expr round-trips through parseCondition", () => {
    fc.assert(
      fc.property(exprArbitrary, (originalExpr) => {
        const printed = printExprFullyParenthesized(originalExpr);
        const parsed = parseCondition(printed);

        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;



        expect(stripSpans(parsed.value)).toEqual(stripSpans(originalExpr));
      }),
      { numRuns: 100 },
    );
  });

  it("Property 2 (robustness): parseCondition and parseEffect never throw and preserve error span invariant", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (src) => {
        const condResult = parseCondition(src);


        expect(condResult).toBeDefined();
        if (!condResult.ok) {
          expect(condResult.error.start).toBeGreaterThanOrEqual(0);
          expect(condResult.error.end).toBeGreaterThanOrEqual(condResult.error.start);
          expect(condResult.error.end).toBeLessThanOrEqual(src.length);
        }

        const effectResult = parseEffect(src);
        expect(effectResult).toBeDefined();
        if (!effectResult.ok) {
          expect(effectResult.error.start).toBeGreaterThanOrEqual(0);
          expect(effectResult.error.end).toBeGreaterThanOrEqual(effectResult.error.start);
          expect(effectResult.error.end).toBeLessThanOrEqual(src.length);
        }
      }),
      { numRuns: 100 },
    );
  });
});
