export type BinaryOp =
  | "||"
  | "&&"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "+"
  | "-"
  | "*"
  | "/";

export type UnaryOp = "!" | "-";

export type EffectOp = "=" | "+=" | "-=";

export interface NumberLit {
  type: "NumberLit";
  value: number;
  start: number;
  end: number;
}

export interface StringLit {
  type: "StringLit";
  value: string;
  start: number;
  end: number;
}

export interface BoolLit {
  type: "BoolLit";
  value: boolean;
  start: number;
  end: number;
}

export interface Identifier {
  type: "Identifier";
  name: string;
  start: number;
  end: number;
}

export interface Unary {
  type: "Unary";
  op: UnaryOp;
  operand: Expr;
  start: number;
  end: number;
}

export interface Binary {
  type: "Binary";
  op: BinaryOp;
  left: Expr;
  right: Expr;
  start: number;
  end: number;
}

export type Expr =
  | NumberLit
  | StringLit
  | BoolLit
  | Identifier
  | Unary
  | Binary;

export interface Effect {
  target: Identifier;
  op: EffectOp;
  value: Expr;
  start: number;
  end: number;
}

export interface ParseError {
  message: string;
  start: number;
  end: number;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ParseError };
