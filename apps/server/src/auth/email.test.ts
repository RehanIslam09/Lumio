import { describe, expect, it } from "vitest";
import { normalizeEmail, validateEmail } from "./email.js";

describe("email module", () => {
  it("normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
    expect(normalizeEmail("Test@Domain.org")).toBe("test@domain.org");
    expect(normalizeEmail("   ")).toBe("");
  });

  it("validateEmail accepts valid ASCII emails", () => {
    const valid = [
      "user@example.com",
      "USER@EXAMPLE.COM",
      "  writer+draft@sub.domain.co.uk  ",
      "a@b.co",
    ];
    for (const email of valid) {
      const res = validateEmail(email);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.email).toBe(normalizeEmail(email));
      }
    }
  });

  it("validateEmail rejects non-string inputs without echoing input", () => {
    const nonStrings = [null, undefined, 123, {}, [], true];
    for (const input of nonStrings) {
      const res = validateEmail(input);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe("Email must be a string");
      }
    }
  });

  it("validateEmail enforces 3..254 character length on normalized email", () => {
    // 2 chars (too short)
    const tooShort = "a@";
    const resShort = validateEmail(tooShort);
    expect(resShort.ok).toBe(false);
    if (!resShort.ok) {
      expect(resShort.reason).toBe("Email must be between 3 and 254 characters");
      expect(resShort.reason.includes(tooShort)).toBe(false);
    }

    // 255 chars (too long)
    const tooLong = "a".repeat(243) + "@example.com"; // 243 + 12 = 255
    const resLong = validateEmail(tooLong);
    expect(resLong.ok).toBe(false);
    if (!resLong.ok) {
      expect(resLong.reason).toBe("Email must be between 3 and 254 characters");
      expect(resLong.reason.includes(tooLong)).toBe(false);
    }
  });

  it("validateEmail rejects non-ASCII characters without echoing input", () => {
    const nonAscii = ["tëst@example.com", "user@éxample.com", "writer🎮@lumio.app"];
    for (const email of nonAscii) {
      const res = validateEmail(email);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe("Email must contain only ASCII characters");
        expect(res.reason.includes(email)).toBe(false);
      }
    }
  });

  it("validateEmail rejects invalid email format via zod without echoing input", () => {
    const invalidFormats = [
      "notanemail",
      "user@",
      "@example.com",
      "user@domain@other.com",
      "user space@domain.com",
    ];
    for (const email of invalidFormats) {
      const res = validateEmail(email);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe("Invalid email address format");
        expect(res.reason.includes(email)).toBe(false);
      }
    }
  });
});
