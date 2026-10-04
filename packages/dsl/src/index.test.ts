import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { Effect, Expr, ParseResult, StringLit } from "./ast.js";
import {
  parseCondition,
  parseEffect,
  buildTypeEnv,
  typecheckCondition,
  typecheckEffect,
  type TypeEnv,
} from "./index.js";
import type { Variable, VariableType } from "@repo/schema";

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

describe("regression: string literals matching operators and keywords parse as StringLit", () => {
  const symbols = [
    "!",
    "-",
    "+",
    "*",
    "/",
    "(",
    ")",
    "&&",
    "||",
    "==",
    "!=",
    "<",
    "<=",
    ">",
    ">=",
    "=",
    "+=",
    "-=",
    "true",
    "false",
  ];

  for (const sym of symbols) {
    it(`parses "${sym}" as StringLit in condition and effect`, () => {
      const condRes = parseCondition(`"${sym}"`);
      expect(condRes.ok).toBe(true);
      if (condRes.ok) {
        expect(condRes.value.type).toBe("StringLit");
        expect((condRes.value as StringLit).value).toBe(sym);
      }

      const effRes = parseEffect(`x = "${sym}"`);
      expect(effRes.ok).toBe(true);
      if (effRes.ok) {
        expect(effRes.value.value.type).toBe("StringLit");
        expect((effRes.value.value as StringLit).value).toBe(sym);
      }
    });
  }
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

  const operatorKeywordArbitrary = fc.constantFrom(
    "!",
    "-",
    "+",
    "*",
    "/",
    "(",
    ")",
    "&&",
    "||",
    "==",
    "!=",
    "<",
    "<=",
    ">",
    ">=",
    "=",
    "+=",
    "-=",
    "true",
    "false",
  );

  const stringArbitrary = fc.oneof(
    operatorKeywordArbitrary,
    fc
      .array(
        fc.oneof(
          fc.constantFrom(
            ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _+-/*=<>!(),".split(""),
          ),
          fc.constant('"'),
          fc.constant("\\"),
          operatorKeywordArbitrary,
        ),
        { maxLength: 20 },
      )
      .map((chars) => chars.join("")),
  );


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

describe("typechecker - unit and property tests", () => {
  const dummyEnv: TypeEnv = new Map<string, VariableType>([
    ["n1", "number"],
    ["n2", "number"],
    ["s1", "string"],
    ["s2", "string"],
    ["b1", "boolean"],
    ["b2", "boolean"],
  ]);

  function assertParseOk<T>(res: ParseResult<T>, src: string): T {
    if (!res.ok) throw new Error(`Failed to parse: ${src} -> ${res.error.message}`);
    return res.value;
  }

  function parseCondOk(src: string): Expr {
    return assertParseOk(parseCondition(src), src);
  }

  function parseEffOk(src: string): Effect {
    return assertParseOk(parseEffect(src), src);
  }

  it("buildTypeEnv: first duplicate wins", () => {
    const vars: Variable[] = [
      { id: "1", name: "x", type: "number" },
      { id: "2", name: "x", type: "string" },
      { id: "3", name: "y", type: "boolean" },
    ];
    const env = buildTypeEnv(vars);
    expect(env.get("x")).toBe("number");
    expect(env.get("y")).toBe("boolean");
  });

  describe("operator unit tests (valid and invalid cases)", () => {
    it("unary !", () => {
      expect(typecheckCondition(parseCondOk("!b1"), dummyEnv)).toHaveLength(0);
      const invalid = typecheckCondition(parseCondOk("!n1"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("unary -", () => {
      const valid = typecheckCondition(parseCondOk("-n1 == 0"), dummyEnv);
      expect(valid).toHaveLength(0);
      const invalid = typecheckCondition(parseCondOk("-s1 == 0"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("binary +", () => {
      expect(typecheckCondition(parseCondOk("n1 + n2 == 0"), dummyEnv)).toHaveLength(0);
      expect(typecheckCondition(parseCondOk('s1 + s2 == "a"'), dummyEnv)).toHaveLength(0);
      const invalid = typecheckCondition(parseCondOk("n1 + s1 == 0"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("binary -", () => {
      expect(typecheckCondition(parseCondOk("n1 - n2 == 0"), dummyEnv)).toHaveLength(0);
      const invalid = typecheckCondition(parseCondOk("n1 - s1 == 0"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("binary *", () => {
      expect(typecheckCondition(parseCondOk("n1 * n2 == 0"), dummyEnv)).toHaveLength(0);
      const invalid = typecheckCondition(parseCondOk("n1 * b1 == 0"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("binary /", () => {
      expect(typecheckCondition(parseCondOk("n1 / n2 == 0"), dummyEnv)).toHaveLength(0);
      const invalid = typecheckCondition(parseCondOk("b1 / n1 == 0"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("binary <", () => {
      expect(typecheckCondition(parseCondOk("n1 < n2"), dummyEnv)).toHaveLength(0);
      const invalid = typecheckCondition(parseCondOk("s1 < s2"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("binary <=", () => {
      expect(typecheckCondition(parseCondOk("n1 <= n2"), dummyEnv)).toHaveLength(0);
      const invalid = typecheckCondition(parseCondOk("b1 <= b2"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("binary >", () => {
      expect(typecheckCondition(parseCondOk("n1 > n2"), dummyEnv)).toHaveLength(0);
      const invalid = typecheckCondition(parseCondOk("s1 > n1"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("binary >=", () => {
      expect(typecheckCondition(parseCondOk("n1 >= n2"), dummyEnv)).toHaveLength(0);
      const invalid = typecheckCondition(parseCondOk("n1 >= b1"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("binary ==", () => {
      expect(typecheckCondition(parseCondOk("n1 == n2"), dummyEnv)).toHaveLength(0);
      expect(typecheckCondition(parseCondOk("b1 == b2"), dummyEnv)).toHaveLength(0);
      const invalid = typecheckCondition(parseCondOk("n1 == s1"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("binary !=", () => {
      expect(typecheckCondition(parseCondOk("n1 != n2"), dummyEnv)).toHaveLength(0);
      expect(typecheckCondition(parseCondOk("b1 != b2"), dummyEnv)).toHaveLength(0);
      const invalid = typecheckCondition(parseCondOk("n1 != b1"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("binary &&", () => {
      expect(typecheckCondition(parseCondOk("b1 && b2"), dummyEnv)).toHaveLength(0);
      const invalid = typecheckCondition(parseCondOk("b1 && n1"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("binary ||", () => {
      expect(typecheckCondition(parseCondOk("b1 || b2"), dummyEnv)).toHaveLength(0);
      const invalid = typecheckCondition(parseCondOk("n1 || b1"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });
  });

  describe("unknown suppression & cascade behavior", () => {
    it("ghost + 1 > 2 yields exactly ONE issue (undefined-variable)", () => {
      const issues = typecheckCondition(parseCondOk("ghost + 1 > 2"), dummyEnv);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.code).toBe("undefined-variable");
    });

    it("ghost == ghost yields two undefined-variable issues and NO mismatch", () => {
      const issues = typecheckCondition(parseCondOk("ghost == ghost"), dummyEnv);
      expect(issues).toHaveLength(2);
      expect(issues[0]?.code).toBe("undefined-variable");
      expect(issues[1]?.code).toBe("undefined-variable");
    });
  });

  describe("condition non-boolean check", () => {
    it("1 + 2 reports type-mismatch over whole expression", () => {
      const expr = parseCondOk("1 + 2");
      const issues = typecheckCondition(expr, dummyEnv);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.code).toBe("type-mismatch");
      expect(issues[0]?.start).toBe(expr.start);
      expect(issues[0]?.end).toBe(expr.end);
    });
  });

  describe("effect checking", () => {
    it("= operator matches target type", () => {
      expect(typecheckEffect(parseEffOk("n1 = 42"), dummyEnv)).toHaveLength(0);
      const invalid = typecheckEffect(parseEffOk('n1 = "str"'), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("+= operator permits number and string, but not boolean", () => {
      expect(typecheckEffect(parseEffOk("n1 += 1"), dummyEnv)).toHaveLength(0);
      expect(typecheckEffect(parseEffOk('s1 += "!"'), dummyEnv)).toHaveLength(0);
      const invalid = typecheckEffect(parseEffOk("b1 += true"), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("-= operator permits only number", () => {
      expect(typecheckEffect(parseEffOk("n1 -= 1"), dummyEnv)).toHaveLength(0);
      const invalid = typecheckEffect(parseEffOk('s1 -= "a"'), dummyEnv);
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.code).toBe("type-mismatch");
    });

    it("undefined target reports undefined-variable and skips value compatibility check", () => {
      const issues = typecheckEffect(parseEffOk('ghost = "val"'), dummyEnv);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.code).toBe("undefined-variable");
    });
  });

  describe("clarification 1: silent unknown at top level", () => {
    it("typecheckCondition: unknown top-level type reports NO condition must be boolean issue", () => {
      const issues = typecheckCondition(parseCondOk("ghost"), dummyEnv);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.code).toBe("undefined-variable");
    });

    it("typecheckEffect: unknown value type reports NO compatibility issue", () => {
      const issues = typecheckEffect(parseEffOk("n1 = ghost"), dummyEnv);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.code).toBe("undefined-variable");
    });
  });

  describe("properties T1, T2, T3", () => {
    type WellTypedAst = { expr: Expr; identifiers: string[] };

    function generateWellTyped(
      targetType: VariableType,
      envVars: { name: string; type: VariableType }[],
      depth: number,
    ): fc.Arbitrary<WellTypedAst> {
      const validVars = envVars.filter((v) => v.type === targetType);

      const leafArbitraries: fc.Arbitrary<WellTypedAst>[] = [];
      if (targetType === "number") {
        leafArbitraries.push(
          fc.integer({ min: -100, max: 100 }).map((val) => ({
            expr: { type: "NumberLit", value: val, start: 0, end: 1 },
            identifiers: [],
          })),
        );
      } else if (targetType === "string") {
        leafArbitraries.push(
          fc.string({ maxLength: 10 }).map((val) => ({
            expr: { type: "StringLit", value: val, start: 0, end: 1 },
            identifiers: [],
          })),
        );
      } else {
        leafArbitraries.push(
          fc.boolean().map((val) => ({
            expr: { type: "BoolLit", value: val, start: 0, end: 1 },
            identifiers: [],
          })),
        );
      }

      for (const v of validVars) {
        leafArbitraries.push(
          fc.constant({
            expr: { type: "Identifier", name: v.name, start: 0, end: 1 },
            identifiers: [v.name],
          }),
        );
      }

      const leaf = fc.oneof(...leafArbitraries);
      if (depth <= 0) return leaf;

      const recursiveArbitraries: fc.Arbitrary<WellTypedAst>[] = [leaf];

      if (targetType === "number") {
        recursiveArbitraries.push(
          generateWellTyped("number", envVars, depth - 1).map((sub) => ({
            expr: { type: "Unary", op: "-", operand: sub.expr, start: 0, end: 1 },
            identifiers: sub.identifiers,
          })),
        );
        recursiveArbitraries.push(
          fc
            .tuple(
              fc.constantFrom<"+" | "-" | "*" | "/">("+", "-", "*", "/"),
              generateWellTyped("number", envVars, depth - 1),
              generateWellTyped("number", envVars, depth - 1),
            )
            .map(([op, left, right]) => ({
              expr: {
                type: "Binary",
                op,
                left: left.expr,
                right: right.expr,
                start: 0,
                end: 1,
              },
              identifiers: [...left.identifiers, ...right.identifiers],
            })),
        );
      } else if (targetType === "string") {
        recursiveArbitraries.push(
          fc
            .tuple(
              generateWellTyped("string", envVars, depth - 1),
              generateWellTyped("string", envVars, depth - 1),
            )
            .map(([left, right]) => ({
              expr: {
                type: "Binary",
                op: "+",
                left: left.expr,
                right: right.expr,
                start: 0,
                end: 1,
              },
              identifiers: [...left.identifiers, ...right.identifiers],
            })),
        );
      } else {
        // boolean
        recursiveArbitraries.push(
          generateWellTyped("boolean", envVars, depth - 1).map((sub) => ({
            expr: { type: "Unary", op: "!", operand: sub.expr, start: 0, end: 1 },
            identifiers: sub.identifiers,
          })),
        );
        recursiveArbitraries.push(
          fc
            .tuple(
              fc.constantFrom<"&&" | "||">("&&", "||"),
              generateWellTyped("boolean", envVars, depth - 1),
              generateWellTyped("boolean", envVars, depth - 1),
            )
            .map(([op, left, right]) => ({
              expr: {
                type: "Binary",
                op,
                left: left.expr,
                right: right.expr,
                start: 0,
                end: 1,
              },
              identifiers: [...left.identifiers, ...right.identifiers],
            })),
        );
        recursiveArbitraries.push(
          fc
            .tuple(
              fc.constantFrom<"<" | "<=" | ">" | ">=">("<", "<=", ">", ">="),
              generateWellTyped("number", envVars, depth - 1),
              generateWellTyped("number", envVars, depth - 1),
            )
            .map(([op, left, right]) => ({
              expr: {
                type: "Binary",
                op,
                left: left.expr,
                right: right.expr,
                start: 0,
                end: 1,
              },
              identifiers: [...left.identifiers, ...right.identifiers],
            })),
        );
        for (const t of ["number", "string", "boolean"] as VariableType[]) {
          recursiveArbitraries.push(
            fc
              .tuple(
                fc.constantFrom<"==" | "!=">("==", "!="),
                generateWellTyped(t, envVars, depth - 1),
                generateWellTyped(t, envVars, depth - 1),
              )
              .map(([op, left, right]) => ({
                expr: {
                  type: "Binary",
                  op,
                  left: left.expr,
                  right: right.expr,
                  start: 0,
                  end: 1,
                },
                identifiers: [...left.identifiers, ...right.identifiers],
              })),
          );
        }
      }

      return fc.oneof(...recursiveArbitraries);
    }

    const typedEnvArbitrary = fc
      .array(
        fc.record({
          name: fc
            .stringMatching(/^[a-z][a-z0-9_]{0,5}$/)
            .filter((s) => s !== "true" && s !== "false"),
          type: fc.constantFrom<VariableType>("number", "string", "boolean"),
        }),
        { minLength: 3, maxLength: 8 },
      )
      .map((arr) => {
        const unique = new Map<string, VariableType>();
        for (const item of arr) {
          if (!unique.has(item.name)) unique.set(item.name, item.type);
        }
        return Array.from(unique.entries()).map(([name, type]) => ({ name, type }));
      });

    it("Property T1 (well-typed by construction): generator expressions return no issues", () => {
      fc.assert(
        fc.property(
          typedEnvArbitrary.chain((envVars) =>
            generateWellTyped("boolean", envVars, 3).map((ast) => ({
              ast,
              env: new Map(envVars.map((v) => [v.name, v.type])),
            })),
          ),
          ({ ast, env }) => {
            const issues = typecheckCondition(ast.expr, env);
            expect(issues).toEqual([]);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("Property T2 (mutation): renaming one identifier yields exactly one undefined-variable issue", () => {
      function mutateOneIdentifier(
        expr: Expr,
        targetIndex: number,
        replacementName: string,
      ): { mutated: Expr; currentIndex: number } {
        function helper(node: Expr, idx: number): { result: Expr; nextIdx: number } {
          switch (node.type) {
            case "Identifier":
              if (idx === targetIndex) {
                return {
                  result: { ...node, name: replacementName },
                  nextIdx: idx + 1,
                };
              }
              return { result: node, nextIdx: idx + 1 };
            case "Unary": {
              const opRes = helper(node.operand, idx);
              return {
                result: { ...node, operand: opRes.result },
                nextIdx: opRes.nextIdx,
              };
            }
            case "Binary": {
              const leftRes = helper(node.left, idx);
              const rightRes = helper(node.right, leftRes.nextIdx);
              return {
                result: { ...node, left: leftRes.result, right: rightRes.result },
                nextIdx: rightRes.nextIdx,
              };
            }
            default:
              return { result: node, nextIdx: idx };
          }
        }
        const { result, nextIdx } = helper(expr, 0);
        return { mutated: result, currentIndex: nextIdx };
      }

      fc.assert(
        fc.property(
          typedEnvArbitrary
            .chain((envVars) =>
              generateWellTyped("boolean", envVars, 3).map((ast) => ({
                ast,
                env: new Map(envVars.map((v) => [v.name, v.type])),
              })),
            )
            .filter(({ ast }) => ast.identifiers.length > 0)
            .chain(({ ast, env }) =>
              fc
                .tuple(
                  fc.integer({ min: 0, max: ast.identifiers.length - 1 }),
                  fc
                    .stringMatching(/^[a-z][a-z0-9_]{6,10}$/)
                    .filter(
                      (name) =>
                        name !== "true" &&
                        name !== "false" &&
                        !env.has(name),
                    ),
                )
                .map(([targetIdx, replName]) => ({
                  ast,
                  env,
                  targetIdx,
                  replName,
                })),
            ),
          ({ ast, env, targetIdx, replName }) => {
            const { mutated } = mutateOneIdentifier(ast.expr, targetIdx, replName);
            const issues = typecheckCondition(mutated, env);
            expect(issues).toHaveLength(1);
            expect(issues[0]?.code).toBe("undefined-variable");
          },
        ),
        { numRuns: 100 },
      );
    });

    it("Property T3 (robustness): if parseCondition succeeds, typecheckCondition never throws and preserves bounds", () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.string({ maxLength: 100 }), typedEnvArbitrary),
          ([src, envVars]) => {
            const parsed = parseCondition(src);
            if (parsed.ok) {
              const env = new Map(envVars.map((v) => [v.name, v.type]));
              const issues = typecheckCondition(parsed.value, env);
              for (const issue of issues) {
                expect(issue.start).toBeGreaterThanOrEqual(0);
                expect(issue.end).toBeGreaterThanOrEqual(issue.start);
                expect(issue.end).toBeLessThanOrEqual(src.length);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
