import { describe, expect, it } from "vitest";
import { formatProjectDate } from "./formatDate.js";

describe("formatProjectDate", () => {
  it("formats valid ISO timestamp string", () => {
    const iso = "2026-10-06T10:30:00.000Z";
    const formatted = formatProjectDate(iso);
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).not.toBe(iso);
  });

  it("falls back safely to input string on invalid dates without throwing", () => {
    expect(formatProjectDate("invalid-date-string")).toBe("invalid-date-string");
    expect(formatProjectDate("")).toBe("");
  });
});
