import type { ParseError } from "./ast.js";

export type TokenType =
  | "NUMBER"
  | "STRING"
  | "BOOL"
  | "IDENT"
  | "PUNCT"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string | number | boolean;
  start: number;
  end: number;
}

export type LexResult =
  | { ok: true; tokens: Token[] }
  | { ok: false; error: ParseError };

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isIdentStart(ch: string): boolean {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    ch === "_"
  );
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

export function tokenize(source: string): LexResult {
  const tokens: Token[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    const ch = source[i];
    if (ch === undefined) {
      break;
    }

    // Skip whitespace
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }

    // Number literal: decimal digits with optional fractional part
    if (isDigit(ch)) {
      const start = i;
      while (i < len && isDigit(source[i] ?? "")) {
        i++;
      }
      if (i < len && source[i] === ".") {
        // Only consume '.' and fraction if the character after '.' is a digit.
        // If not followed by digit (e.g. '3.'), do NOT consume '.', leaving it as an unexpected char.
        if (i + 1 < len && isDigit(source[i + 1] ?? "")) {
          i++; // consume '.'
          while (i < len && isDigit(source[i] ?? "")) {
            i++;
          }
        }
      }
      const raw = source.slice(start, i);
      tokens.push({
        type: "NUMBER",
        value: Number(raw),
        start,
        end: i,
      });
      continue;
    }

    // String literal: double-quoted, escapes \" and \\ only
    if (ch === '"') {
      const start = i;
      i++; // skip opening quote
      let val = "";
      let terminated = false;

      while (i < len) {
        const c = source[i];
        if (c === undefined) {
          break;
        }
        if (c === '"') {
          i++; // skip closing quote
          terminated = true;
          break;
        }
        if (c === "\\") {
          const escStart = i;
          i++; // skip backslash
          if (i >= len) {
            // Reached EOF while in escape: unterminated string
            return {
              ok: false,
              error: {
                message: "unterminated string",
                start,
                end: len,
              },
            };
          }
          const escChar = source[i] ?? "";
          if (escChar === '"' || escChar === "\\") {
            val += escChar;
            i++;
          } else {
            return {
              ok: false,
              error: {
                message: `invalid escape sequence '\\${escChar}'`,
                start: escStart,
                end: escStart + 2,
              },
            };
          }
        } else {
          val += c;
          i++;
        }
      }

      if (!terminated) {
        return {
          ok: false,
          error: {
            message: "unterminated string",
            start,
            end: len,
          },
        };
      }

      tokens.push({
        type: "STRING",
        value: val,
        start,
        end: i,
      });
      continue;
    }

    // Identifiers and boolean literals
    if (isIdentStart(ch)) {
      const start = i;
      while (i < len && isIdentPart(source[i] ?? "")) {
        i++;
      }
      const name = source.slice(start, i);
      if (name === "true") {
        tokens.push({
          type: "BOOL",
          value: true,
          start,
          end: i,
        });
      } else if (name === "false") {
        tokens.push({
          type: "BOOL",
          value: false,
          start,
          end: i,
        });
      } else {
        tokens.push({
          type: "IDENT",
          value: name,
          start,
          end: i,
        });
      }
      continue;
    }

    // Two-character operators
    if (i + 1 < len) {
      const two = source.slice(i, i + 2);
      if (
        two === "||" ||
        two === "&&" ||
        two === "==" ||
        two === "!=" ||
        two === "<=" ||
        two === ">=" ||
        two === "+=" ||
        two === "-="
      ) {
        tokens.push({
          type: "PUNCT",
          value: two,
          start: i,
          end: i + 2,
        });
        i += 2;
        continue;
      }
    }

    // Single-character operators / punctuation
    if (
      ch === "<" ||
      ch === ">" ||
      ch === "+" ||
      ch === "-" ||
      ch === "*" ||
      ch === "/" ||
      ch === "!" ||
      ch === "(" ||
      ch === ")" ||
      ch === "="
    ) {
      tokens.push({
        type: "PUNCT",
        value: ch,
        start: i,
        end: i + 1,
      });
      i++;
      continue;
    }

    // Any other character is an error
    return {
      ok: false,
      error: {
        message: `unexpected character '${ch}'`,
        start: i,
        end: i + 1,
      },
    };
  }

  tokens.push({
    type: "EOF",
    value: "",
    start: len,
    end: len,
  });

  return { ok: true, tokens };
}
