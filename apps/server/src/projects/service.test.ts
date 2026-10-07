import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "@repo/schema";
import { createRateLimiter } from "../auth/rateLimiter.js";
import { FakeProjectRepo } from "./fakes.js";
import { createProjectService } from "./service.js";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";
const OTHER_UUID = "22222222-2222-2222-2222-222222222222";

function makeMinimalProject(name = "Test Project") {
  return {
    id: "proj-1",
    name,
    nodes: [
      { id: "node-1", type: "start", title: "Start" },
      { id: "node-2", type: "end", title: "End" },
    ],
    edges: [{ id: "edge-1", from: "node-1", to: "node-2" }],
    variables: [],
  };
}

describe("ProjectService", () => {
  it("creates a project with first version and retrieves it", async () => {
    const projects = new FakeProjectRepo();
    const nowMs = 1_000_000;
    const clock = () => new Date(nowMs);
    const limiter = createRateLimiter({ max: 60, windowMs: 60_000, now: () => nowMs });
    const service = createProjectService({
      projects,
      clock,
      limiter,
      limits: { maxProjectsPerUser: 10 },
    });

    const createRes = await service.create(VALID_UUID, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      document: makeMinimalProject("First Project"),
    });

    expect(createRes.ok).toBe(true);
    if (!createRes.ok) return;

    expect(createRes.data.project.name).toBe("First Project");
    expect(createRes.data.project.latestVersion).toBe(1);
    expect(createRes.data.version.versionNumber).toBe(1);

    const getRes = await service.get({ id: createRes.data.project.id, ownerId: VALID_UUID });
    expect(getRes.ok).toBe(true);
    if (!getRes.ok) return;
    expect(getRes.data.project.name).toBe("First Project");
    expect(getRes.data.document.name).toBe("First Project");
  });

  it("returns unified 404 for invalid uuid, non-existent project, or project owned by another user", async () => {
    const projects = new FakeProjectRepo();
    const service = createProjectService({
      projects,
      clock: () => new Date(1_000_000),
      limiter: createRateLimiter({ max: 60, windowMs: 60_000 }),
      limits: { maxProjectsPerUser: 10 },
    });

    // 1. Invalid UUID
    const resBadId = await service.get({ id: "not-a-uuid", ownerId: VALID_UUID });
    expect(resBadId.ok).toBe(false);
    if (!resBadId.ok) expect(resBadId.code).toBe("not-found");

    // 2. Non-existent UUID
    const resNotFound = await service.get({ id: VALID_UUID, ownerId: VALID_UUID });
    expect(resNotFound.ok).toBe(false);
    if (!resNotFound.ok) expect(resNotFound.code).toBe("not-found");

    // 3. Owned by another user
    const created = await service.create(VALID_UUID, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      document: makeMinimalProject(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const resOtherUser = await service.get({ id: created.data.project.id, ownerId: OTHER_UUID });
    expect(resOtherUser.ok).toBe(false);
    if (!resOtherUser.ok) expect(resOtherUser.code).toBe("not-found");
  });

  it("enforces maxProjectsPerUser project limit", async () => {
    const projects = new FakeProjectRepo();
    const service = createProjectService({
      projects,
      clock: () => new Date(1_000_000),
      limiter: createRateLimiter({ max: 60, windowMs: 60_000 }),
      limits: { maxProjectsPerUser: 2 },
    });

    const res1 = await service.create(VALID_UUID, { schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("P1") });
    expect(res1.ok).toBe(true);

    const res2 = await service.create(VALID_UUID, { schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("P2") });
    expect(res2.ok).toBe(true);

    const res3 = await service.create(VALID_UUID, { schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("P3") });
    expect(res3.ok).toBe(false);
    if (!res3.ok) {
      expect(res3.code).toBe("project-limit-reached");
    }

    // Second user is unaffected
    const resOther = await service.create(OTHER_UUID, { schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("Other P1") });
    expect(resOther.ok).toBe(true);
  });

  it("handles optimistic concurrency conflict when saving a new version", async () => {
    const projects = new FakeProjectRepo();
    const service = createProjectService({
      projects,
      clock: () => new Date(1_000_000),
      limiter: createRateLimiter({ max: 60, windowMs: 60_000 }),
      limits: { maxProjectsPerUser: 10 },
    });

    const createRes = await service.create(VALID_UUID, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      document: makeMinimalProject("Initial"),
    });
    expect(createRes.ok).toBe(true);
    if (!createRes.ok) return;
    const projectId = createRes.data.project.id;

    // Save with correct baseVersion (1) -> version 2
    const save1 = await service.save({
      id: projectId,
      ownerId: VALID_UUID,
      raw: {
        baseVersion: 1,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: makeMinimalProject("Updated Name"),
      },
    });
    expect(save1.ok).toBe(true);
    if (!save1.ok) return;
    expect(save1.data.version.versionNumber).toBe(2);
    expect(save1.data.project.name).toBe("Updated Name");

    // Stale save with baseVersion 1 when currentVersion is 2 -> conflict
    const staleSave = await service.save({
      id: projectId,
      ownerId: VALID_UUID,
      raw: {
        baseVersion: 1,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: makeMinimalProject("Stale update"),
      },
    });
    expect(staleSave.ok).toBe(false);
    if (!staleSave.ok) {
      expect(staleSave.code).toBe("version-conflict");
      if (staleSave.code === "version-conflict") {
        expect(staleSave.currentVersion).toBe(2);
      }
    }
  });

  it("enforces write rate limit on create/save/delete and resets across window edges", async () => {
    const projects = new FakeProjectRepo();
    let nowMs = 1_000_000;
    const clock = () => new Date(nowMs);
    const limiter = createRateLimiter({
      max: 2,
      windowMs: 60_000,
      now: () => nowMs,
    });
    const service = createProjectService({
      projects,
      clock,
      limiter,
      limits: { maxProjectsPerUser: 10 },
    });

    // 1st write
    const w1 = await service.create(VALID_UUID, { schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("W1") });
    expect(w1.ok).toBe(true);

    // 2nd write
    const w2 = await service.create(VALID_UUID, { schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("W2") });
    expect(w2.ok).toBe(true);

    // 3rd write -> rate limited!
    const w3 = await service.create(VALID_UUID, { schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("W3") });
    expect(w3.ok).toBe(false);
    if (!w3.ok) {
      expect(w3.code).toBe("rate-limited");
      if (w3.code === "rate-limited") {
        expect(w3.retryAfterSeconds).toBeGreaterThan(0);
      }
    }

    // Reads are NOT limited
    const listRes = await service.list(VALID_UUID);
    expect(listRes.ok).toBe(true);

    // Advance clock past 60s window
    nowMs += 61_000;

    // Now write succeeds again
    const w4 = await service.create(VALID_UUID, { schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("W4") });
    expect(w4.ok).toBe(true);
  });

  it("validates version numbers in getVersion and returns unified 404 for bad n", async () => {
    const projects = new FakeProjectRepo();
    const service = createProjectService({
      projects,
      clock: () => new Date(1_000_000),
      limiter: createRateLimiter({ max: 60, windowMs: 60_000 }),
      limits: { maxProjectsPerUser: 10 },
    });

    const createRes = await service.create(VALID_UUID, { schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject() });
    expect(createRes.ok).toBe(true);
    if (!createRes.ok) return;
    const projectId = createRes.data.project.id;

    // Bad version numbers: 0, negative, > 2147483647, non-integer
    expect((await service.getVersion({ id: projectId, ownerId: VALID_UUID, versionNumber: 0 })).ok).toBe(false);
    expect((await service.getVersion({ id: projectId, ownerId: VALID_UUID, versionNumber: -1 })).ok).toBe(false);
    expect((await service.getVersion({ id: projectId, ownerId: VALID_UUID, versionNumber: 2147483648 })).ok).toBe(false);
    expect((await service.getVersion({ id: projectId, ownerId: VALID_UUID, versionNumber: 1.5 })).ok).toBe(false);

    // Valid version 1 succeeds
    const v1 = await service.getVersion({ id: projectId, ownerId: VALID_UUID, versionNumber: 1 });
    expect(v1.ok).toBe(true);
  });

  it("deletes a project and its versions", async () => {
    const projects = new FakeProjectRepo();
    const service = createProjectService({
      projects,
      clock: () => new Date(1_000_000),
      limiter: createRateLimiter({ max: 60, windowMs: 60_000 }),
      limits: { maxProjectsPerUser: 10 },
    });

    const createRes = await service.create(VALID_UUID, { schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject() });
    expect(createRes.ok).toBe(true);
    if (!createRes.ok) return;
    const projectId = createRes.data.project.id;

    const delRes = await service.delete({ id: projectId, ownerId: VALID_UUID });
    expect(delRes.ok).toBe(true);

    // After deletion, get returns 404
    const getRes = await service.get({ id: projectId, ownerId: VALID_UUID });
    expect(getRes.ok).toBe(false);
    if (!getRes.ok) expect(getRes.code).toBe("not-found");
  });
});
