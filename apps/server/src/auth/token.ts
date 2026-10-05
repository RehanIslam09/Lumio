import crypto from "node:crypto";

export type RandomBytesFn = (size: number) => Buffer;

const WELL_FORMED_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

export function generateSessionToken(
  randomBytes: RandomBytesFn = crypto.randomBytes,
): string {
  const bytes = randomBytes(32);
  return bytes.toString("base64url");
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function isWellFormedToken(s: unknown): s is string {
  return typeof s === "string" && WELL_FORMED_TOKEN_REGEX.test(s);
}
