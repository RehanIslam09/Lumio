import type {
  BinaryOp,
  Effect,
  EffectOp,
  Expr,
  Identifier,
  ParseResult,
  UnaryOp,
} from "./ast.js";
import { type Token, tokenize } from "./lexer.js";

const MAX_NESTING_DEPTH = 200;

class Parser {
  private tokens: Token[];
  private pos = 0;
  private sourceLen: number;

  constructor(tokens: Token[], sourceLen: number) {
    this.tokens = tokens;
    this.sourceLen = sourceLen;
  }

  private peek(): Token {
    return (
      this.tokens[this.pos] ?? {
        type: "EOF",
        value: "",
        start: this.sourceLen,
        end: this.sourceLen,
      }
    );
  }

  private consume(): Token {
    const tok = this.peek();
    this.pos++;
    return tok;
  }

  parseCondition(): ParseResult<Expr> {
    if (this.peek().type === "EOF") {
      return {
        ok: false,
        error: {
          message: "unexpected end of input",
          start: this.sourceLen,
          end: this.sourceLen,
        },
      };
    }

    const res = this.parseExpr(0);
    if (!res.ok) {
      return res;
    }

    if (this.peek().type !== "EOF") {
      const tok = this.peek();
      return {
        ok: false,
        error: {
          message: `unexpected token '${tok.value}'`,
          start: tok.start,
          end: tok.end,
        },
      };
    }

    return res;
  }

  parseEffect(): ParseResult<Effect> {
    if (this.peek().type === "EOF") {
      return {
        ok: false,
        error: {
          message: "unexpected end of input",
          start: this.sourceLen,
          end: this.sourceLen,
        },
      };
    }

    const targetTok = this.peek();
    if (targetTok.type !== "IDENT") {
      return {
        ok: false,
        error: {
          message: "effect target must be an identifier",
          start: targetTok.start,
          end: targetTok.end,
        },
      };
    }
    this.consume();

    const target: Identifier = {
      type: "Identifier",
      name: String(targetTok.value),
      start: targetTok.start,
      end: targetTok.end,
    };

    const opTok = this.peek();
    if (opTok.type === "EOF") {
      return {
        ok: false,
        error: {
          message: "expected effect assignment operator ('=', '+=', or '-=')",
          start: this.sourceLen,
          end: this.sourceLen,
        },
      };
    }

    if (
      opTok.value !== "=" &&
      opTok.value !== "+=" &&
      opTok.value !== "-="
    ) {
      return {
        ok: false,
        error: {
          message: "expected effect assignment operator ('=', '+=', or '-=')",
          start: opTok.start,
          end: opTok.end,
        },
      };
    }
    const op = opTok.value as EffectOp;
    this.consume();

    const valRes = this.parseExpr(0);
    if (!valRes.ok) {
      return valRes;
    }

    if (this.peek().type !== "EOF") {
      const tok = this.peek();
      return {
        ok: false,
        error: {
          message: `unexpected token '${tok.value}'`,
          start: tok.start,
          end: tok.end,
        },
      };
    }

    return {
      ok: true,
      value: {
        target,
        op,
        value: valRes.value,
        start: target.start,
        end: valRes.value.end,
      },
    };
  }

  private parseExpr(depth: number): ParseResult<Expr> {
    return this.parseOr(depth);
  }

  private parseOr(depth: number): ParseResult<Expr> {
    let leftRes = this.parseAnd(depth);
    if (!leftRes.ok) return leftRes;

    while (this.peek().value === "||") {
      const opTok = this.consume();
      const rightRes = this.parseAnd(depth);
      if (!rightRes.ok) return rightRes;

      leftRes = {
        ok: true,
        value: {
          type: "Binary",
          op: opTok.value as BinaryOp,
          left: leftRes.value,
          right: rightRes.value,
          start: leftRes.value.start,
          end: rightRes.value.end,
        },
      };
    }

    return leftRes;
  }

  private parseAnd(depth: number): ParseResult<Expr> {
    let leftRes = this.parseEquality(depth);
    if (!leftRes.ok) return leftRes;

    while (this.peek().value === "&&") {
      const opTok = this.consume();
      const rightRes = this.parseEquality(depth);
      if (!rightRes.ok) return rightRes;

      leftRes = {
        ok: true,
        value: {
          type: "Binary",
          op: opTok.value as BinaryOp,
          left: leftRes.value,
          right: rightRes.value,
          start: leftRes.value.start,
          end: rightRes.value.end,
        },
      };
    }

    return leftRes;
  }

  private parseEquality(depth: number): ParseResult<Expr> {
    let leftRes = this.parseRelational(depth);
    if (!leftRes.ok) return leftRes;

    while (this.peek().value === "==" || this.peek().value === "!=") {
      const opTok = this.consume();
      const rightRes = this.parseRelational(depth);
      if (!rightRes.ok) return rightRes;

      leftRes = {
        ok: true,
        value: {
          type: "Binary",
          op: opTok.value as BinaryOp,
          left: leftRes.value,
          right: rightRes.value,
          start: leftRes.value.start,
          end: rightRes.value.end,
        },
      };
    }

    return leftRes;
  }

  private parseRelational(depth: number): ParseResult<Expr> {
    let leftRes = this.parseAdditive(depth);
    if (!leftRes.ok) return leftRes;

    while (
      this.peek().value === "<" ||
      this.peek().value === "<=" ||
      this.peek().value === ">" ||
      this.peek().value === ">="
    ) {
      const opTok = this.consume();
      const rightRes = this.parseAdditive(depth);
      if (!rightRes.ok) return rightRes;

      leftRes = {
        ok: true,
        value: {
          type: "Binary",
          op: opTok.value as BinaryOp,
          left: leftRes.value,
          right: rightRes.value,
          start: leftRes.value.start,
          end: rightRes.value.end,
        },
      };
    }

    return leftRes;
  }

  private parseAdditive(depth: number): ParseResult<Expr> {
    let leftRes = this.parseTerm(depth);
    if (!leftRes.ok) return leftRes;

    while (this.peek().value === "+" || this.peek().value === "-") {
      const opTok = this.consume();
      const rightRes = this.parseTerm(depth);
      if (!rightRes.ok) return rightRes;

      leftRes = {
        ok: true,
        value: {
          type: "Binary",
          op: opTok.value as BinaryOp,
          left: leftRes.value,
          right: rightRes.value,
          start: leftRes.value.start,
          end: rightRes.value.end,
        },
      };
    }

    return leftRes;
  }

  private parseTerm(depth: number): ParseResult<Expr> {
    let leftRes = this.parseUnary(depth);
    if (!leftRes.ok) return leftRes;

    while (this.peek().value === "*" || this.peek().value === "/") {
      const opTok = this.consume();
      const rightRes = this.parseUnary(depth);
      if (!rightRes.ok) return rightRes;

      leftRes = {
        ok: true,
        value: {
          type: "Binary",
          op: opTok.value as BinaryOp,
          left: leftRes.value,
          right: rightRes.value,
          start: leftRes.value.start,
          end: rightRes.value.end,
        },
      };
    }

    return leftRes;
  }

  private parseUnary(depth: number): ParseResult<Expr> {
    const tok = this.peek();
    if (tok.value === "!" || tok.value === "-") {
      if (depth + 1 > MAX_NESTING_DEPTH) {
        return {
          ok: false,
          error: {
            message: "expression nested too deeply",
            start: tok.start,
            end: tok.end,
          },
        };
      }
      this.consume();
      const operandRes = this.parseUnary(depth + 1);
      if (!operandRes.ok) return operandRes;

      return {
        ok: true,
        value: {
          type: "Unary",
          op: tok.value as UnaryOp,
          operand: operandRes.value,
          start: tok.start,
          end: operandRes.value.end,
        },
      };
    }

    return this.parsePrimary(depth);
  }

  private parsePrimary(depth: number): ParseResult<Expr> {
    const tok = this.peek();

    if (tok.type === "NUMBER") {
      this.consume();
      return {
        ok: true,
        value: {
          type: "NumberLit",
          value: Number(tok.value),
          start: tok.start,
          end: tok.end,
        },
      };
    }

    if (tok.type === "STRING") {
      this.consume();
      return {
        ok: true,
        value: {
          type: "StringLit",
          value: String(tok.value),
          start: tok.start,
          end: tok.end,
        },
      };
    }

    if (tok.type === "BOOL") {
      this.consume();
      return {
        ok: true,
        value: {
          type: "BoolLit",
          value: Boolean(tok.value),
          start: tok.start,
          end: tok.end,
        },
      };
    }

    if (tok.type === "IDENT") {
      this.consume();
      return {
        ok: true,
        value: {
          type: "Identifier",
          name: String(tok.value),
          start: tok.start,
          end: tok.end,
        },
      };
    }

    if (tok.value === "(") {
      if (depth + 1 > MAX_NESTING_DEPTH) {
        return {
          ok: false,
          error: {
            message: "expression nested too deeply",
            start: tok.start,
            end: tok.end,
          },
        };
      }
      this.consume();
      const innerRes = this.parseExpr(depth + 1);
      if (!innerRes.ok) return innerRes;

      const closing = this.peek();
      if (closing.value === ")") {
        this.consume();
        return innerRes;
      }

      if (closing.type === "EOF") {
        return {
          ok: false,
          error: {
            message: "unexpected end of input",
            start: this.sourceLen,
            end: this.sourceLen,
          },
        };
      }

      return {
        ok: false,
        error: {
          message: `unexpected token '${closing.value}'`,
          start: closing.start,
          end: closing.end,
        },
      };
    }

    if (tok.type === "EOF") {
      return {
        ok: false,
        error: {
          message: "unexpected end of input",
          start: this.sourceLen,
          end: this.sourceLen,
        },
      };
    }

    return {
      ok: false,
      error: {
        message: `unexpected token '${tok.value}'`,
        start: tok.start,
        end: tok.end,
      },
    };
  }
}

export function parseCondition(source: string): ParseResult<Expr> {
  const lexResult = tokenize(source);
  if (!lexResult.ok) {
    return lexResult;
  }
  const parser = new Parser(lexResult.tokens, source.length);
  return parser.parseCondition();
}

export function parseEffect(source: string): ParseResult<Effect> {
  const lexResult = tokenize(source);
  if (!lexResult.ok) {
    return lexResult;
  }
  const parser = new Parser(lexResult.tokens, source.length);
  return parser.parseEffect();
}
