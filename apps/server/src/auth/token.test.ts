import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import {
  generateSessionToken,
  hashSessionToken,
  isWellFormedToken,
} from "./token.js";

describe("token module", () => {
  it("generateSessionToken produces 43 characters base64url string from 32 bytes", () => {
    const token = generateSessionToken();
    expect(token).toHaveLength(43);
    expect(isWellFormedToken(token)).toBe(true);

    // Injected randomBytes
    const mockBytes = Buffer.alloc(32, 0xaa);
    const tokenFromMock = generateSessionToken(() => mockBytes);
    expect(tokenFromMock).toHaveLength(43);
    expect(tokenFromMock).toBe(mockBytes.toString("base64url"));
  });

  it("hashSessionToken deterministically produces 64 hex characters using sha256", () => {
    const token = "abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";
    const hash1 = hashSessionToken(token);
    const hash2 = hashSessionToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);

    // Verify against direct crypto sha256
    const expected = crypto.createHash("sha256").update(token).digest("hex");
    expect(hash1).toBe(expected);
  });

  it("isWellFormedToken validates exactly 43 chars of base64url characters", () => {
    // Valid 43 chars
    const valid = "A".repeat(43);
    expect(isWellFormedToken(valid)).toBe(true);

    const validMixed = "a-B_1" + "z".repeat(38);
    expect(isWellFormedToken(validMixed)).toBe(true);

    // Invalid lengths
    expect(isWellFormedToken("A".repeat(42))).toBe(false);
    expect(isWellFormedToken("A".repeat(44))).toBe(false);
    expect(isWellFormedToken("")).toBe(false);

    // Invalid characters (e.g. +, /, =, padding, spaces, specials)
    expect(isWellFormedToken("A".repeat(42) + "+")).toBe(false);
    expect(isWellFormedToken("A".repeat(42) + "/")).toBe(false);
    expect(isWellFormedToken("A".repeat(42) + "=")).toBe(false);
    expect(isWellFormedToken("A".repeat(42) + " ")).toBe(false);
    expect(isWellFormedToken("A".repeat(42) + "$")).toBe(false);

    // Non-strings
    expect(isWellFormedToken(null)).toBe(false);
    expect(isWellFormedToken(undefined)).toBe(false);
    expect(isWellFormedToken(12345)).toBe(false);
    expect(isWellFormedToken({})).toBe(false);
  });
});
