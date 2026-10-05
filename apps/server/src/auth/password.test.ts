import { describe, expect, it } from "vitest";
import { validatePassword } from "./password.js";

describe("password module", () => {
  it("rejects non-strings without echoing input", () => {
    const nonStrings = [null, undefined, 1234567890, {}, [], true];
    for (const val of nonStrings) {
      const res = validatePassword(val);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe("Password must be a string");
      }
    }
  });

  it("enforces minimum 10 code points boundary (9 vs 10)", () => {
    const nineChars = "123456789"; // 9 ASCII chars
    const resNine = validatePassword(nineChars);
    expect(resNine.ok).toBe(false);
    if (!resNine.ok) {
      expect(resNine.reason).toBe("Password must be between 10 and 128 characters");
      expect(resNine.reason.includes(nineChars)).toBe(false);
    }

    const tenChars = "1234567890"; // 10 ASCII chars
    const resTen = validatePassword(tenChars);
    expect(resTen.ok).toBe(true);
    if (resTen.ok) {
      expect(resTen.password).toBe(tenChars);
    }
  });

  it("enforces maximum 128 code points boundary (128 vs 129)", () => {
    const maxChars = "a".repeat(128);
    const resMax = validatePassword(maxChars);
    expect(resMax.ok).toBe(true);
    if (resMax.ok) {
      expect(resMax.password).toBe(maxChars);
    }

    const overMax = "a".repeat(129);
    const resOver = validatePassword(overMax);
    expect(resOver.ok).toBe(false);
    if (!resOver.ok) {
      expect(resOver.reason).toBe("Password must be between 10 and 128 characters");
      expect(resOver.reason.includes(overMax)).toBe(false);
    }
  });

  it("counts Unicode code points, not UTF-16 code units (surrogate pairs / emoji)", () => {
    // 9 ASCII chars + 1 emoji (e.g. 🎮) = 10 Unicode code points, but 11 UTF-16 units
    const passwordWithEmoji = "123456789🎮";
    expect(passwordWithEmoji.length).toBe(11); // UTF-16 length
    const resEmoji = validatePassword(passwordWithEmoji);
    expect(resEmoji.ok).toBe(true);

    // 8 ASCII chars + 1 emoji = 9 code points (too short even though UTF-16 length is 10)
    const tooShortWithEmoji = "12345678🎮";
    expect(tooShortWithEmoji.length).toBe(10);
    const resShortEmoji = validatePassword(tooShortWithEmoji);
    expect(resShortEmoji.ok).toBe(false);

    // 128 emojis: 128 code points, UTF-16 length 256
    const emojis128 = "🔥".repeat(128);
    expect(emojis128.length).toBe(256);
    const res128Emojis = validatePassword(emojis128);
    expect(res128Emojis.ok).toBe(true);

    // 129 emojis: 129 code points (too long)
    const emojis129 = "🔥".repeat(129);
    const res129Emojis = validatePassword(emojis129);
    expect(res129Emojis.ok).toBe(false);
  });
});
