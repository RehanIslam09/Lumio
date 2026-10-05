import { describe, expect, it } from "vitest";
import { createArgon2Hasher } from "./passwordHasher.js";

describe("passwordHasher: real Argon2id implementation", () => {
  it("hashes password and verifies successfully with expected PHC format", async () => {
    const hasher = createArgon2Hasher();
    const password = "correctHorseBatteryStaple!";

    const t0 = performance.now();
    const hash = await hasher.hash(password);
    const durationMs = performance.now() - t0;

    // Check PHC prefix
    expect(hash.startsWith("$argon2id$v=19$m=19456,t=2,p=1$")).toBe(true);

    // Verify true for right password
    const verifyGood = await hasher.verify(hash, password);
    expect(verifyGood).toBe(true);

    // Verify false for wrong password
    const verifyBad = await hasher.verify(hash, "wrongPassword123!");
    expect(verifyBad).toBe(false);

    // Verify garbage hash returns false and never throws
    const garbage1 = await hasher.verify("garbage-not-a-hash", password);
    expect(garbage1).toBe(false);

    const garbage2 = await hasher.verify("$argon2id$v=19$m=19456$invalid-parts", password);
    expect(garbage2).toBe(false);

    const garbage3 = await hasher.verify("", password);
    expect(garbage3).toBe(false);

    // Report measured milliseconds
    console.log(`[MEASURED HASHER DURATION] One hash took: ${durationMs.toFixed(2)} ms`);
  });
});
