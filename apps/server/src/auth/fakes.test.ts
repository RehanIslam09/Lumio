import { describe, expect, it } from "vitest";
import { createFakeSessionRepo, createFakeUserRepo } from "./fakes.js";
import { EmailTakenError } from "../db/errors.js";

describe("in-memory fake repositories", () => {
  it("fake UserRepo creates, finds, and rejects duplicate emails with EmailTakenError", async () => {
    const userRepo = createFakeUserRepo();
    const created = await userRepo.create({
      email: "test@example.com",
      passwordHash: "hash123",
    });
    expect(created.id).toBeDefined();
    expect(created.email).toBe("test@example.com");

    const found = await userRepo.findByEmail("test@example.com");
    expect(found?.passwordHash).toBe("hash123");

    const pub = await userRepo.findPublicById(created.id);
    expect(pub).toEqual({ id: created.id, email: "test@example.com" });

    await expect(
      userRepo.create({ email: "test@example.com", passwordHash: "otherHash" }),
    ).rejects.toThrow(EmailTakenError);
  });

  it("fake SessionRepo trimToNewest with distinct createdAt values keeps newest", async () => {
    const sessionRepo = createFakeSessionRepo();
    const userId = "user-1";

    // Insert 5 sessions with advancing timestamps
    const s1 = await sessionRepo.create({
      userId,
      tokenHash: "0000000000000000000000000000000000000000000000000000000000000001",
      createdAt: new Date("2026-10-05T10:00:00Z"),
      expiresAt: new Date("2026-11-05T10:00:00Z"),
    });
    const s2 = await sessionRepo.create({
      userId,
      tokenHash: "0000000000000000000000000000000000000000000000000000000000000002",
      createdAt: new Date("2026-10-05T11:00:00Z"),
      expiresAt: new Date("2026-11-05T11:00:00Z"),
    });
    const s3 = await sessionRepo.create({
      userId,
      tokenHash: "0000000000000000000000000000000000000000000000000000000000000003",
      createdAt: new Date("2026-10-05T12:00:00Z"),
      expiresAt: new Date("2026-11-05T12:00:00Z"),
    });
    const s4 = await sessionRepo.create({
      userId,
      tokenHash: "0000000000000000000000000000000000000000000000000000000000000004",
      createdAt: new Date("2026-10-05T13:00:00Z"),
      expiresAt: new Date("2026-11-05T13:00:00Z"),
    });
    const s5 = await sessionRepo.create({
      userId,
      tokenHash: "0000000000000000000000000000000000000000000000000000000000000005",
      createdAt: new Date("2026-10-05T14:00:00Z"),
      expiresAt: new Date("2026-11-05T14:00:00Z"),
    });

    // Trim to 3 newest (should keep s5, s4, s3; delete s2, s1)
    await sessionRepo.trimToNewest(userId, 3);

    expect(await sessionRepo.findByTokenHash(s1.tokenHash)).toBeNull();
    expect(await sessionRepo.findByTokenHash(s2.tokenHash)).toBeNull();
    expect(await sessionRepo.findByTokenHash(s3.tokenHash)).not.toBeNull();
    expect(await sessionRepo.findByTokenHash(s4.tokenHash)).not.toBeNull();
    expect(await sessionRepo.findByTokenHash(s5.tokenHash)).not.toBeNull();
  });

  it("fake SessionRepo trimToNewest with EQUAL createdAt values is deterministic using id DESC", async () => {
    const sessionRepo1 = createFakeSessionRepo();
    const sessionRepo2 = createFakeSessionRepo();
    const userId = "user-tie";
    const sameTime = new Date("2026-10-05T10:00:00Z");
    const expiry = new Date("2026-11-05T10:00:00Z");

    const tokens = [
      "1000000000000000000000000000000000000000000000000000000000000001",
      "1000000000000000000000000000000000000000000000000000000000000002",
      "1000000000000000000000000000000000000000000000000000000000000003",
      "1000000000000000000000000000000000000000000000000000000000000004",
      "1000000000000000000000000000000000000000000000000000000000000005",
    ];

    const fixedIds = [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000004",
      "00000000-0000-0000-0000-000000000005",
    ];

    for (const [i, fixedId] of fixedIds.entries()) {
      const token = tokens[i] ?? "";
      sessionRepo1.sessions.set(fixedId, {
        id: fixedId,
        userId,
        tokenHash: token,
        createdAt: sameTime,
        expiresAt: expiry,
      });
      sessionRepo2.sessions.set(fixedId, {
        id: fixedId,
        userId,
        tokenHash: token,
        createdAt: sameTime,
        expiresAt: expiry,
      });
    }

    await sessionRepo1.trimToNewest(userId, 2);
    await sessionRepo2.trimToNewest(userId, 2);

    expect(sessionRepo1.sessions.size).toBe(2);
    expect(sessionRepo2.sessions.size).toBe(2);

    // Kept IDs must be exactly the 2 largest IDs: ...005 and ...004
    const remaining1 = Array.from(sessionRepo1.sessions.keys()).sort();
    const remaining2 = Array.from(sessionRepo2.sessions.keys()).sort();
    expect(remaining1).toEqual([
      "00000000-0000-0000-0000-000000000004",
      "00000000-0000-0000-0000-000000000005",
    ]);
    expect(remaining1).toEqual(remaining2);
  });
});
