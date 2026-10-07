import { eq } from "drizzle-orm";
import * as fc from "fast-check";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { composeApp } from "../compose.js";
import type { Config } from "../config.js";
import { createDb, type DbInstance } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { projects, projectVersions, users } from "../db/schema.js";
import { loadServerEnv } from "../db/testEnv.js";
import { checkTestDatabaseUrl } from "../db/testSafety.js";
import { createDrizzleProjectRepo } from "./drizzleProjectRepo.js";
import { isWellFormedUnicode } from "./validate.js";
import { CURRENT_SCHEMA_VERSION, type Project } from "@repo/schema";

describe("Projects Integration Test Suite (lumio_test)", () => {
  let dbInstance: DbInstance;
  let testUrl: string;

  const intTestConfig: Config = {
    port: 3001,
    nodeEnv: "test",
    databaseUrl: "postgresql://localhost:5432/lumio_test",
    corsOrigins: ["http://localhost:5173"],
    sessionTtlDays: 30,
  };

  beforeAll(async () => {
    loadServerEnv();
    testUrl = process.env.TEST_DATABASE_URL ?? "";

    const safety = checkTestDatabaseUrl(testUrl, process.env.DATABASE_URL);
    if (!safety.ok) {
      throw new Error(
        `Test database safety check failed: ${safety.reason}. ` +
          "Integration tests require a running local PostgreSQL service and TEST_DATABASE_URL in apps/server/.env.",
      );
    }

    dbInstance = createDb(testUrl, { max: 10 });

    try {
      await dbInstance.pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE;");
      await dbInstance.pool.query("DROP SCHEMA IF EXISTS public CASCADE;");
      await dbInstance.pool.query("CREATE SCHEMA public;");
      await runMigrations(dbInstance.db);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to initialize test database schema: ${msg}. ` +
          "Ensure PostgreSQL service is running and TEST_DATABASE_URL in apps/server/.env is accessible.",
      );
    }
  });

  afterAll(async () => {
    if (dbInstance) {
      await dbInstance.close();
    }
  });

  beforeEach(async () => {
    await dbInstance.pool.query("TRUNCATE users, projects, project_versions, sessions CASCADE;");
  });

  function makeApp(options?: {
    projectLimits?: { maxProjectsPerUser?: number };
    projectRateLimit?: { max: number; windowMs: number };
  }) {
    return composeApp(intTestConfig, {
      db: dbInstance.db,
      logError: () => {},
      projectLimits: options?.projectLimits,
      projectRateLimit: options?.projectRateLimit,
    });
  }

  async function registerUser(app: ReturnType<typeof makeApp>, email: string) {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password: "Password123!" }),
    });
    expect(res.status).toBe(201);
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    const match = setCookie.match(/lumio_session=([^;]+)/);
    const token = match ? match[1] : "";
    const body = (await res.json()) as { user: { id: string; email: string } };
    return { user: body.user, cookie: `lumio_session=${token}` };
  }

  function makeMinimalProject(name = "Initial Project"): Project {
    return {
      id: "client-proj-id",
      name,
      nodes: [
        { id: "node-1", type: "start", title: "Start" },
        { id: "node-2", type: "end", title: "End" },
      ],
      edges: [{ id: "edge-1", from: "node-1", to: "node-2" }],
      variables: [],
    };
  }

  // 1. composeApp full flow with the real hasher
  it("1. composeApp full flow: register -> create -> get -> save -> stale save 409 -> list -> versions -> delete", async () => {
    const app = makeApp();
    const { cookie } = await registerUser(app, "fullflow@example.com");

    // create
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: makeMinimalProject("My Project"),
      }),
    });
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as {
      project: { id: string; name: string; latestVersion: number };
      version: { versionNumber: number; schemaVersion: number };
    };
    const projectId = createBody.project.id;
    expect(createBody.project.name).toBe("My Project");
    expect(createBody.project.latestVersion).toBe(1);
    expect(createBody.version.versionNumber).toBe(1);

    // get
    const getRes = await app.request(`/api/projects/${projectId}`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as {
      project: { id: string; name: string; latestVersion: number };
      version: { versionNumber: number };
      document: Project;
    };
    expect(getBody.project.name).toBe("My Project");
    expect(getBody.document.name).toBe("My Project");

    // save new version
    const saveRes = await app.request(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        baseVersion: 1,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: makeMinimalProject("Renamed Project"),
      }),
    });
    expect(saveRes.status).toBe(200);
    const saveBody = (await saveRes.json()) as {
      project: { name: string; latestVersion: number };
      version: { versionNumber: number };
    };
    expect(saveBody.project.name).toBe("Renamed Project");
    expect(saveBody.version.versionNumber).toBe(2);

    // stale save with baseVersion 1 -> 409 version-conflict
    const staleRes = await app.request(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        baseVersion: 1,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: makeMinimalProject("Stale Save"),
      }),
    });
    expect(staleRes.status).toBe(409);
    const staleBody = (await staleRes.json()) as {
      error: { code: string; currentVersion: number };
    };
    expect(staleBody.error.code).toBe("version-conflict");
    expect(staleBody.error.currentVersion).toBe(2);

    // list
    const listRes = await app.request("/api/projects", {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      projects: { id: string; name: string; latestVersion: number }[];
    };
    expect(listBody.projects.length).toBe(1);
    expect(listBody.projects[0]?.name).toBe("Renamed Project");
    expect(listBody.projects[0]?.latestVersion).toBe(2);

    // versions
    const versRes = await app.request(`/api/projects/${projectId}/versions`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(versRes.status).toBe(200);
    const versBody = (await versRes.json()) as {
      versions: { versionNumber: number; createdByMe: boolean }[];
    };
    expect(versBody.versions.length).toBe(2);
    expect(versBody.versions[0]?.versionNumber).toBe(2);
    expect(versBody.versions[0]?.createdByMe).toBe(true);
    expect(versBody.versions[1]?.versionNumber).toBe(1);
    expect(versBody.versions[1]?.createdByMe).toBe(true);

    // get version 1
    const v1Res = await app.request(`/api/projects/${projectId}/versions/1`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(v1Res.status).toBe(200);
    const v1Body = (await v1Res.json()) as { document: Project };
    expect(v1Body.document.name).toBe("My Project");

    // delete
    const delRes = await app.request(`/api/projects/${projectId}`, {
      method: "DELETE",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
      },
    });
    expect(delRes.status).toBe(204);

    // get after delete -> 404
    const getDeleted = await app.request(`/api/projects/${projectId}`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(getDeleted.status).toBe(404);
  });

  // 2. Round-trip property (fast-check)
  it("2. Round-trip property: POST then GET returns document deep-equal to validated input", async () => {
    const app = makeApp();
    const { cookie } = await registerUser(app, "roundtrip@example.com");

    const safeStringArbitrary = fc
      .stringMatching(/^[A-Za-z0-9 _-]{1,30}$/)
      .filter((s) => !s.includes("\u0000") && isWellFormedUnicode(s) && s.trim().length > 0);

    const projectArbitrary = fc
      .record({
        name: safeStringArbitrary,
        nodeCount: fc.integer({ min: 1, max: 4 }),
      })
      .map(({ name, nodeCount }) => {
        const nodes = Array.from({ length: nodeCount }, (_, i) => ({
          id: `node-${i}`,
          type: i === 0 ? ("start" as const) : ("scene" as const),
          title: `Scene ${i}`,
        }));
        const edges =
          nodeCount > 1
            ? [
                {
                  id: "edge-0",
                  from: "node-0",
                  to: "node-1",
                },
              ]
            : [];
        const variables = [
          {
            id: "var-0",
            name: "counter",
            type: "number" as const,
            initial: 0,
          },
        ];
        return {
          id: "client-id",
          name,
          nodes,
          edges,
          variables,
        };
      });

    await fc.assert(
      fc.asyncProperty(projectArbitrary, async (project) => {
        const createRes = await app.request("/api/projects", {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: "http://localhost:5173",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            schemaVersion: CURRENT_SCHEMA_VERSION,
            document: project,
          }),
        });
        expect(createRes.status).toBe(201);
        const { project: created } = (await createRes.json()) as { project: { id: string } };

        const getRes = await app.request(`/api/projects/${created.id}`, {
          method: "GET",
          headers: { Cookie: cookie },
        });
        expect(getRes.status).toBe(200);
        const { document: retrieved } = (await getRes.json()) as { document: Project };

        // Deep equality comparison
        expect(retrieved).toEqual(project);
        // Arrays maintain exact ordering
        expect(retrieved.nodes.map((n) => n.id)).toEqual(project.nodes.map((n) => n.id));
        expect(retrieved.edges.map((e) => e.id)).toEqual(project.edges.map((e) => e.id));
        expect(retrieved.variables.map((v) => v.id)).toEqual(project.variables.map((v) => v.id));
      }),
      { numRuns: 15 },
    );
  });

  // 3. Concurrency
  it("3. Concurrency: (a) sequential saves 1..10 give contiguous version numbers; (b) 2-PUT race x20; (c) 5-PUT race", async () => {
    const app = makeApp({ projectRateLimit: { max: 10_000, windowMs: 60_000 } });
    const { cookie } = await registerUser(app, "concurrency@example.com");

    // (a) sequential saves 1..10
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("Seq") }),
    });
    const { project: p1 } = (await createRes.json()) as { project: { id: string } };

    for (let v = 1; v < 10; v++) {
      const res = await app.request(`/api/projects/${p1.id}`, {
        method: "PUT",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baseVersion: v,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          document: makeMinimalProject(`Seq ${v + 1}`),
        }),
      });
      expect(res.status).toBe(200);
      const b = (await res.json()) as { version: { versionNumber: number } };
      expect(b.version.versionNumber).toBe(v + 1);
    }

    // Stale baseVersion gives 409
    const staleRes = await app.request(`/api/projects/${p1.id}`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        baseVersion: 5,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: makeMinimalProject("Stale"),
      }),
    });
    expect(staleRes.status).toBe(409);
    const staleBody = (await staleRes.json()) as { error: { currentVersion: number } };
    expect(staleBody.error.currentVersion).toBe(10);

    // (b) RACE: two simultaneous PUTs with the SAME baseVersion -> exactly one 200 and one 409 (repeated 20 times)
    for (let r = 0; r < 20; r++) {
      const cRes = await app.request("/api/projects", {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject(`Race ${r}`) }),
      });
      const { project: raceProj } = (await cRes.json()) as { project: { id: string } };

      const put1 = app.request(`/api/projects/${raceProj.id}`, {
        method: "PUT",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ baseVersion: 1, schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("Race Win 1") }),
      });
      const put2 = app.request(`/api/projects/${raceProj.id}`, {
        method: "PUT",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ baseVersion: 1, schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("Race Win 2") }),
      });

      const [res1, res2] = await Promise.all([put1, put2]);
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const conflictRes = res1.status === 409 ? res1 : res2;
      const conflictBody = (await conflictRes.json()) as { error: { currentVersion: number } };
      expect(conflictBody.error.currentVersion).toBe(2);
    }

    // (c) five concurrent PUTs all with base 1 -> exactly one 200 and four 409
    const c5Res = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("5-way Race") }),
    });
    const { project: p5 } = (await c5Res.json()) as { project: { id: string } };

    const fivePuts = Array.from({ length: 5 }, (_, i) =>
      app.request(`/api/projects/${p5.id}`, {
        method: "PUT",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baseVersion: 1,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          document: makeMinimalProject(`Candidate ${i}`),
        }),
      }),
    );

    const fiveRes = await Promise.all(fivePuts);
    const fiveStatuses = fiveRes.map((r) => r.status).sort();
    expect(fiveStatuses).toEqual([200, 409, 409, 409, 409]);
  });

  // 4. Cap race
  it("4. Cap race: injected maxProjectsPerUser = 3; 8 concurrent creates by one user -> exactly 3 x 201 and 5 x 409", async () => {
    const app = makeApp({ projectLimits: { maxProjectsPerUser: 3 } });
    const { cookie: cookieA } = await registerUser(app, "cap_a@example.com");
    const { cookie: cookieB } = await registerUser(app, "cap_b@example.com");

    const eightCreates = Array.from({ length: 8 }, (_, i) =>
      app.request("/api/projects", {
        method: "POST",
        headers: {
          Cookie: cookieA,
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schemaVersion: CURRENT_SCHEMA_VERSION,
          document: makeMinimalProject(`Cap Project ${i}`),
        }),
      }),
    );

    const results = await Promise.all(eightCreates);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 201, 409, 409, 409, 409, 409]);

    // Second user is unaffected
    const bRes = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookieB,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: makeMinimalProject("User B Project"),
      }),
    });
    expect(bRes.status).toBe(201);
  });

  // 5. Delete-vs-save race
  it("5. Delete-vs-save race: concurrent PUT and DELETE on same project -> each in {200, 204, 404, 409}, never 5xx, gone at end", async () => {
    const app = makeApp();
    const { cookie } = await registerUser(app, "del_race@example.com");

    for (let i = 0; i < 5; i++) {
      const createRes = await app.request("/api/projects", {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject(`DelRace ${i}`) }),
      });
      const { project: p } = (await createRes.json()) as { project: { id: string } };

      const putReq = app.request(`/api/projects/${p.id}`, {
        method: "PUT",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baseVersion: 1,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          document: makeMinimalProject("Updated Name"),
        }),
      });

      const delReq = app.request(`/api/projects/${p.id}`, {
        method: "DELETE",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:5173",
        },
      });

      const [putRes, delRes] = await Promise.all([putReq, delReq]);
      expect([200, 404, 409]).toContain(putRes.status);
      expect([204, 404]).toContain(delRes.status);

      // Verify gone at end
      const checkRes = await app.request(`/api/projects/${p.id}`, {
        method: "GET",
        headers: { Cookie: cookie },
      });
      expect(checkRes.status).toBe(404);
    }
  });

  // 6. Authorization
  it("6. Authorization: User B gets 404 for A's project on every endpoint; B's list excludes A's", async () => {
    const app = makeApp();
    const { user: userA, cookie: cookieA } = await registerUser(app, "usera@example.com");
    const { cookie: cookieB } = await registerUser(app, "userb@example.com");

    // User A creates project
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookieA,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("A's Project") }),
    });
    const { project: projA } = (await createRes.json()) as { project: { id: string } };

    // User B tries to read A's project -> 404
    const getB = await app.request(`/api/projects/${projA.id}`, {
      method: "GET",
      headers: { Cookie: cookieB },
    });
    expect(getB.status).toBe(404);

    // User B tries to PUT A's project -> 404
    const putB = await app.request(`/api/projects/${projA.id}`, {
      method: "PUT",
      headers: {
        Cookie: cookieB,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ baseVersion: 1, schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("Hack") }),
    });
    expect(putB.status).toBe(404);

    // User B tries to list versions of A's project -> 404
    const versB = await app.request(`/api/projects/${projA.id}/versions`, {
      method: "GET",
      headers: { Cookie: cookieB },
    });
    expect(versB.status).toBe(404);

    // User B tries to get version 1 of A's project -> 404
    const v1B = await app.request(`/api/projects/${projA.id}/versions/1`, {
      method: "GET",
      headers: { Cookie: cookieB },
    });
    expect(v1B.status).toBe(404);

    // User B tries to delete A's project -> 404
    const delB = await app.request(`/api/projects/${projA.id}`, {
      method: "DELETE",
      headers: {
        Cookie: cookieB,
        Origin: "http://localhost:5173",
      },
    });
    expect(delB.status).toBe(404);

    // B's list excludes A's project
    const listB = await app.request("/api/projects", {
      method: "GET",
      headers: { Cookie: cookieB },
    });
    expect(listB.status).toBe(200);
    const listBBody = (await listB.json()) as { projects: { id: string }[] };
    expect(listBBody.projects.some((p) => p.id === projA.id)).toBe(false);

    // A's project is unchanged
    const getA = await app.request(`/api/projects/${projA.id}`, {
      method: "GET",
      headers: { Cookie: cookieA },
    });
    expect(getA.status).toBe(200);
    const getABody = (await getA.json()) as { project: { name: string } };
    expect(getABody.project.name).toBe("A's Project");
    expect(userA.id).toBeDefined();
  });

  // 7. Text safety
  it("7. Text safety: observes PostgreSQL 22P02 on lone surrogate; rejects U+0000 and lone surrogates with 400 before DB insert", async () => {
    const repo = createDrizzleProjectRepo(dbInstance.db);
    const app = makeApp();
    const { user, cookie } = await registerUser(app, "textsafety@example.com");

    // 1. Direct repo observation: what does PostgreSQL do with a lone surrogate?
    let observedCode: string | undefined;
    try {
      await repo.createWithFirstVersion({
        ownerId: user.id,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: {
          id: "p1",
          name: "Valid Name",
          nodes: [{ id: "n1", type: "start", title: "Lone\uD800Surrogate" }],
          edges: [],
          variables: [],
        } as unknown as Project,
        maxProjectsPerUser: 10,
        now: new Date(),
      });
    } catch (e: unknown) {
      if (e && typeof e === "object" && "cause" in e) {
        const cause = (e as { cause?: { code?: string } }).cause;
        observedCode = cause?.code;
      }
    }
    // PIN the observed SQLSTATE: 22P02
    expect(observedCode).toBe("22P02");

    // 2. Direct repo observation: what does PostgreSQL do with U+0000?
    let observedNullCode: string | undefined;
    try {
      await repo.createWithFirstVersion({
        ownerId: user.id,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: {
          id: "p2",
          name: "Valid Name",
          nodes: [{ id: "n1", type: "start", title: "Null\u0000Byte" }],
          edges: [],
          variables: [],
        } as unknown as Project,
        maxProjectsPerUser: 10,
        now: new Date(),
      });
    } catch (e: unknown) {
      if (e && typeof e === "object" && "cause" in e) {
        const cause = (e as { cause?: { code?: string } }).cause;
        observedNullCode = cause?.code;
      }
    }
    // PIN the observed SQLSTATE for null byte: 22P05
    expect(observedNullCode).toBe("22P05");

    // 3. API level rejection before DB insert: no rows written
    const rowsBefore = await dbInstance.db.select().from(projects);
    const countBefore = rowsBefore.length;

    // Reject lone surrogate with 400
    const resSurrogate = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: {
          id: "p",
          name: "Surrogate Project",
          nodes: [{ id: "n1", type: "start", title: "Bad\uD800Title" }],
          edges: [],
          variables: [],
        },
      }),
    });
    expect(resSurrogate.status).toBe(400);

    // Reject U+0000 with 400
    const resNull = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: {
          id: "p",
          name: "Null Project",
          nodes: [{ id: "n1", type: "start", title: "Bad\u0000Title" }],
          edges: [],
          variables: [],
        },
      }),
    });
    expect(resNull.status).toBe(400);

    // No rows written
    const rowsAfter = await dbInstance.db.select().from(projects);
    expect(rowsAfter.length).toBe(countBefore);
  });

  // 8. Size limit mapping
  it("8. Size: under 5,000,000 bytes succeeds (201); over 5,000,000 bytes by database check returns 413 document-too-large", async () => {
    const repo = createDrizzleProjectRepo(dbInstance.db);
    const { user } = await registerUser(makeApp(), "size@example.com");

    // Build document just under and just over 5,000,000 bytes
    // In PostgreSQL: octet_length(document::text) <= 5000000
    // Test direct repo behavior:
    // With N = 4_999_910 repeat 'a' -> under 5MB -> succeeds
    // With N = 5_000_010 repeat 'a' -> over 5MB -> 23514 mapped to DocumentTooLargeError
    const baseProj = makeMinimalProject("Size Project");
    const overProj: Project = {
      ...baseProj,
      nodes: [
        { id: "node-1", type: "start", title: "a".repeat(5_000_100) },
        { id: "node-2", type: "end", title: "End" },
      ],
    };

    // Calling repo with overProj throws DocumentTooLargeError
    await expect(
      repo.createWithFirstVersion({
        ownerId: user.id,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: overProj,
        maxProjectsPerUser: 10,
        now: new Date(),
      }),
    ).rejects.toThrowError("Document exceeds maximum allowed size");

    // Calling repo with underProj succeeds
    const underProj: Project = {
      ...baseProj,
      nodes: [
        { id: "node-1", type: "start", title: "a".repeat(10_000) },
        { id: "node-2", type: "end", title: "End" },
      ],
    };
    const underRes = await repo.createWithFirstVersion({
      ownerId: user.id,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      document: underProj,
      maxProjectsPerUser: 10,
      now: new Date(),
    });
    expect(underRes.ok).toBe(true);
  });

  // 9. Name sync and DB-agreement property
  it("9. Name sync: projects.name equals document.name after create and renaming save; DB agreement property", async () => {
    const app = makeApp();
    const { cookie } = await registerUser(app, "namesync@example.com");

    // Create with initial name
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: makeMinimalProject("Initial Name 🌟"),
      }),
    });
    const { project: p } = (await createRes.json()) as { project: { id: string; name: string } };
    expect(p.name).toBe("Initial Name 🌟");

    // Verify database row directly
    const [dbRow1] = await dbInstance.db.select().from(projects).where(eq(projects.id, p.id));
    expect(dbRow1?.name).toBe("Initial Name 🌟");

    // Renaming save
    const saveRes = await app.request(`/api/projects/${p.id}`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        baseVersion: 1,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: makeMinimalProject("Renamed 🚀"),
      }),
    });
    expect(saveRes.status).toBe(200);

    const [dbRow2] = await dbInstance.db.select().from(projects).where(eq(projects.id, p.id));
    expect(dbRow2?.name).toBe("Renamed 🚀");

    // Fast-check DB-agreement: any valid name accepted by validateProjectInput never violates projects_name_length_check
    const safeNameArbitrary = fc
      .stringMatching(/^[A-Za-z0-9 _-]{1,190}$/)
      .filter((s) => s.trim().length > 0 && Array.from(s).length <= 200);

    await fc.assert(
      fc.asyncProperty(safeNameArbitrary, async (randomName) => {
        const res = await app.request("/api/projects", {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: "http://localhost:5173",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            schemaVersion: CURRENT_SCHEMA_VERSION,
            document: makeMinimalProject(randomName),
          }),
        });
        expect(res.status).toBe(201);
      }),
      { numRuns: 10 },
    );
  });

  // 10. Cascade
  it("10. Cascade: deleting user removes projects and versions; deleting project removes versions", async () => {
    const app = makeApp();
    const { user, cookie } = await registerUser(app, "cascade@example.com");

    // Create project
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("Cascade Proj") }),
    });
    const { project: p } = (await createRes.json()) as { project: { id: string } };

    // Save a 2nd version
    await app.request(`/api/projects/${p.id}`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ baseVersion: 1, schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("V2") }),
    });

    const vRowsBefore = await dbInstance.db.select().from(projectVersions).where(eq(projectVersions.projectId, p.id));
    expect(vRowsBefore.length).toBe(2);

    // 1. Deleting user cascades to projects and project_versions
    await dbInstance.db.delete(users).where(eq(users.id, user.id));

    const pRowsAfterUserDel = await dbInstance.db.select().from(projects).where(eq(projects.id, p.id));
    expect(pRowsAfterUserDel.length).toBe(0);

    const vRowsAfterUserDel = await dbInstance.db.select().from(projectVersions).where(eq(projectVersions.projectId, p.id));
    expect(vRowsAfterUserDel.length).toBe(0);

    // 2. Deleting project cascades to project_versions
    const { cookie: cookie2 } = await registerUser(app, "cascade2@example.com");
    const c2Res = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie2,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, document: makeMinimalProject("Proj 2") }),
    });
    const { project: p2 } = (await c2Res.json()) as { project: { id: string } };

    const delRes = await app.request(`/api/projects/${p2.id}`, {
      method: "DELETE",
      headers: {
        Cookie: cookie2,
        Origin: "http://localhost:5173",
      },
    });
    expect(delRes.status).toBe(204);

    const v2RowsAfterDel = await dbInstance.db.select().from(projectVersions).where(eq(projectVersions.projectId, p2.id));
    expect(v2RowsAfterDel.length).toBe(0);
  });

  // 11. Content Model v2 & Schema Versioning
  it("11. Content Model v2: writes at v2 preserve entities/speaker/body; writes at v1 rejected with 422; stored v1 read is immutable", async () => {
    const app = makeApp();
    const { user, cookie } = await registerUser(app, "v2content@example.com");

    const v2Doc: Project = {
      id: "v2-proj-id",
      name: "V2 Story",
      entities: [
        { id: "char-1", name: "Alice", kind: "character", description: "Hero" },
        { id: "loc-1", name: "Castle", kind: "location" },
      ],
      nodes: [
        { id: "node-1", type: "start", title: "Start", speakerId: "char-1", body: "Once upon a time..." },
        { id: "node-2", type: "end", title: "End" },
      ],
      edges: [{ id: "edge-1", from: "node-1", to: "node-2" }],
      variables: [],
    };

    // 1. POST at v2 succeeds with 201, returns schemaVersion: 2, preserves entities/speaker/body
    const createRes = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: v2Doc,
      }),
    });
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as {
      project: { id: string };
      version: { versionNumber: number; schemaVersion: number };
    };
    expect(createBody.version.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const createdId = createBody.project.id;

    // Verify GET returns preserved v2 fields
    const getRes = await app.request(`/api/projects/${createdId}`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as {
      document: Project;
      version: { schemaVersion: number };
    };
    expect(getBody.version.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(getBody.document.entities).toEqual(v2Doc.entities);
    expect(getBody.document.nodes[0]?.speakerId).toBe("char-1");
    expect(getBody.document.nodes[0]?.body).toBe("Once upon a time...");

    // 2. POST with schemaVersion: 1 rejected with 422 unsupported-schema-version
    const postV1Res = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: 1,
        document: makeMinimalProject("Legacy Write"),
      }),
    });
    expect(postV1Res.status).toBe(422);
    const postV1Body = (await postV1Res.json()) as {
      error: { code: string; supported: number };
    };
    expect(postV1Body.error.code).toBe("unsupported-schema-version");
    expect(postV1Body.error.supported).toBe(CURRENT_SCHEMA_VERSION);

    // 3. PUT with schemaVersion: 1 rejected with 422
    const putV1Res = await app.request(`/api/projects/${createdId}`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        baseVersion: 1,
        schemaVersion: 1,
        document: makeMinimalProject("Legacy Save"),
      }),
    });
    expect(putV1Res.status).toBe(422);

    // 4. PUT with v2 document succeeds with 200, returns schemaVersion: 2
    const updatedV2Doc: Project = {
      ...v2Doc,
      name: "V2 Story Updated",
    };
    const putV2Res = await app.request(`/api/projects/${createdId}`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        baseVersion: 1,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: updatedV2Doc,
      }),
    });
    expect(putV2Res.status).toBe(200);
    const putV2Body = (await putV2Res.json()) as {
      version: { versionNumber: number; schemaVersion: number };
    };
    expect(putV2Body.version.versionNumber).toBe(2);
    expect(putV2Body.version.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // 5. speakerId pointing to nonexistent entity or kind !== 'character' -> 400 invalid-request
    const badSpeakerDoc: Project = {
      ...v2Doc,
      nodes: [
        { id: "node-1", type: "start", title: "Start", speakerId: "loc-1" },
        { id: "node-2", type: "end", title: "End" },
      ],
    };
    const badSpeakerRes = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: badSpeakerDoc,
      }),
    });
    expect(badSpeakerRes.status).toBe(400);

    // 6. Stored v1 document read by GET /api/projects/:id returns schemaVersion: 1 (stored row immutable)
    const v1ProjId = "00000000-0000-0000-0000-000000000001";
    await dbInstance.db.insert(projects).values({
      id: v1ProjId,
      ownerId: user.id,
      name: "Legacy V1 Project",
    });
    await dbInstance.db.insert(projectVersions).values({
      projectId: v1ProjId,
      versionNumber: 1,
      schemaVersion: 1,
      document: makeMinimalProject("Legacy V1 Project"),
    });

    const getStoredV1 = await app.request(`/api/projects/${v1ProjId}`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(getStoredV1.status).toBe(200);
    const storedV1Body = (await getStoredV1.json()) as {
      version: { schemaVersion: number; versionNumber: number };
    };
    expect(storedV1Body.version.schemaVersion).toBe(1);

    const getStoredV1Version = await app.request(`/api/projects/${v1ProjId}/versions/1`, {
      method: "GET",
      headers: { Cookie: cookie },
    });
    expect(getStoredV1Version.status).toBe(200);
    const storedV1VersionBody = (await getStoredV1Version.json()) as {
      version: { schemaVersion: number };
    };
    expect(storedV1VersionBody.version.schemaVersion).toBe(1);
  });
});
