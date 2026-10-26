import { describe, it, expect } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  validatePasswordRequirements,
  AUTH_FEATURES,
  isDevNavVisible,
} from "./authPresentation.js";

describe("authPresentation pure helpers (W-047)", () => {
  describe("1. Password Requirements Validation (Scope A)", () => {
    it("defines exact minimum and maximum bounds matching server rules", () => {
      expect(PASSWORD_MIN_LENGTH).toBe(10);
      expect(PASSWORD_MAX_LENGTH).toBe(128);
    });

    it("rejects 9 code points (one below minimum)", () => {
      const res = validatePasswordRequirements("a".repeat(9));
      expect(res.ok).toBe(false);
      expect(res.meetsMin).toBe(false);
      expect(res.exceedsMax).toBe(false);
      expect(res.codePoints).toBe(9);
      expect(res.reason).toBe("Password must be at least 10 characters");
    });

    it("accepts 10 code points (exact minimum boundary)", () => {
      const res = validatePasswordRequirements("a".repeat(10));
      expect(res.ok).toBe(true);
      expect(res.meetsMin).toBe(true);
      expect(res.exceedsMax).toBe(false);
      expect(res.codePoints).toBe(10);
      expect(res.reason).toBeUndefined();
    });

    it("accepts 128 code points (exact maximum boundary)", () => {
      const res = validatePasswordRequirements("a".repeat(128));
      expect(res.ok).toBe(true);
      expect(res.meetsMin).toBe(true);
      expect(res.exceedsMax).toBe(false);
      expect(res.codePoints).toBe(128);
      expect(res.reason).toBeUndefined();
    });

    it("rejects 129 code points (one above maximum)", () => {
      const res = validatePasswordRequirements("a".repeat(129));
      expect(res.ok).toBe(false);
      expect(res.meetsMin).toBe(true);
      expect(res.exceedsMax).toBe(true);
      expect(res.codePoints).toBe(129);
      expect(res.reason).toBe("Password must not exceed 128 characters");
    });

    it("correctly counts surrogate pair Unicode emojis as single code points", () => {
      // 🔒 is 2 UTF-16 code units (length === 2), but 1 Unicode code point
      const emoji = "🔒";
      expect(emoji.length).toBe(2);
      expect(Array.from(emoji).length).toBe(1);

      // 9 emojis = 9 code points (rejected)
      const nineEmojis = emoji.repeat(9);
      expect(validatePasswordRequirements(nineEmojis).ok).toBe(false);
      expect(validatePasswordRequirements(nineEmojis).codePoints).toBe(9);

      // 10 emojis = 10 code points (accepted)
      const tenEmojis = emoji.repeat(10);
      expect(validatePasswordRequirements(tenEmojis).ok).toBe(true);
      expect(validatePasswordRequirements(tenEmojis).codePoints).toBe(10);

      // 129 emojis = 129 code points (rejected)
      const overEmojis = emoji.repeat(129);
      expect(validatePasswordRequirements(overEmojis).ok).toBe(false);
      expect(validatePasswordRequirements(overEmojis).codePoints).toBe(129);
    });
  });

  describe("2. AUTH_FEATURES Metadata (Scope A)", () => {
    it("defines exactly 4 feature items with unique IDs", () => {
      expect(AUTH_FEATURES.length).toBe(4);
      const ids = AUTH_FEATURES.map((f) => f.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(4);
      expect(uniqueIds).toEqual(
        new Set(["cloud-save", "playtest", "simulate", "checker"]),
      );
    });

    it("contains truthful copy and valid icon names for each feature", () => {
      for (const feature of AUTH_FEATURES) {
        expect(feature.title.length).toBeGreaterThan(5);
        expect(feature.description.length).toBeGreaterThan(15);
        expect(["cloud", "play", "activity", "alert"]).toContain(
          feature.iconName,
        );
      }
    });
  });

  describe("3. isDevNavVisible Helper (Scope A)", () => {
    it("returns true when running in development environment", () => {
      expect(isDevNavVisible(true)).toBe(true);
    });

    it("returns false when running in production environment", () => {
      expect(isDevNavVisible(false)).toBe(false);
    });

    it("returns false when environment flag is undefined", () => {
      expect(isDevNavVisible(undefined)).toBe(false);
    });
  });
});
