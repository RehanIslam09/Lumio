import { eq } from "drizzle-orm";
import * as fc from "fast-check";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { composeApp } from "../compose.js";
import type { Config } from "../config.js";
import { createDb, type DbInstance } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { sessions, users } from "../db/schema.js";
import { loadServerEnv } from "../db/testEnv.js";
import { checkTestDatabaseUrl } from "../db/testSafety.js";
import { createDrizzleSessionRepo, createDrizzleUserRepo } from "./drizzleRepos.js";
import { validateEmail } from "./email.js";
import { createArgon2Hasher } from "./passwordHasher.js";
import { createAuthRoutes } from "./routes.js";
import { createAuthService } from "./service.js";
import { hashSessionToken } from "./token.js";

describe("Auth Integration Test Suite (lumio_test)", () => {
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
      // Clean slate once per run: drop public and drizzle schemas, then run migrations from scratch
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
    // Truncate all tables between tests
    await dbInstance.pool.query("TRUNCATE users, projects, project_versions, sessions CASCADE;");
  });

  // Test 1: Sessions table introspection
  it("1. Introspection: sessions table columns, 5 constraints, 2 indexes, and FK CASCADE", async () => {
    // 1. Columns
    const colsRes = await dbInstance.pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sessions'
      ORDER BY column_name;
    `);
    const colMap = new Map(colsRes.rows.map((r: { column_name: string; data_type: string; is_nullable: string }) => [r.column_name, r]));
    expect(colMap.has("id")).toBe(true);
    expect(colMap.has("user_id")).toBe(true);
    expect(colMap.has("token_hash")).toBe(true);
    expect(colMap.has("created_at")).toBe(true);
    expect(colMap.has("expires_at")).toBe(true);
    expect(colMap.get("id")?.data_type).toBe("uuid");
    expect(colMap.get("user_id")?.data_type).toBe("uuid");
    expect(colMap.get("token_hash")?.data_type).toBe("text");
    expect(colMap.get("created_at")?.data_type).toContain("timestamp");
    expect(colMap.get("expires_at")?.data_type).toContain("timestamp");

    // 2. Constraints (5 constraints)
    const constraintsRes = await dbInstance.pool.query(`
      SELECT conname
      FROM pg_catalog.pg_constraint
      WHERE connamespace = 'public'::regnamespace AND conrelid = 'public.sessions'::regclass;
    `);
    const constraintNames = new Set(constraintsRes.rows.map((r: { conname: string }) => r.conname));
    expect(constraintNames.has("sessions_pkey")).toBe(true);
    expect(constraintNames.has("sessions_token_hash_unique")).toBe(true);
    expect(constraintNames.has("sessions_token_hash_shape_check")).toBe(true);
    expect(constraintNames.has("sessions_expiry_check")).toBe(true);
    expect(constraintNames.has("sessions_user_id_fkey")).toBe(true);

    // 3. Indexes (2 non-primary indexes)
    const indexesRes = await dbInstance.pool.query(`
      SELECT indexname
      FROM pg_catalog.pg_indexes
      WHERE schemaname = 'public' AND tablename = 'sessions';
    `);
    const indexNames = new Set(indexesRes.rows.map((r: { indexname: string }) => r.indexname));
    expect(indexNames.has("sessions_user_id_idx")).toBe(true);
    expect(indexNames.has("sessions_expires_at_idx")).toBe(true);

    // 4. FK delete rule: CASCADE
    const fkRes = await dbInstance.pool.query(`
      SELECT constraint_name, delete_rule
      FROM information_schema.referential_constraints
      WHERE constraint_schema = 'public' AND constraint_name = 'sessions_user_id_fkey';
    `);
    expect(fkRes.rows[0]?.delete_rule).toBe("CASCADE");
  });

  // Test 2: Real DB Repos: create/find/delete, token_hash === sha256(raw), cascade delete, expired cleanup, trimToNewest
  it("2. Repos against real DB: token stored as hash, cascading user delete, expired cleanup, trimToNewest", async () => {
    const userRepo = createDrizzleUserRepo(dbInstance.db);
    const sessionRepo = createDrizzleSessionRepo(dbInstance.db);

    const user = await userRepo.create({
      email: "repouser@example.com",
      passwordHash: "some_hashed_val",
    });
    expect(user.id).toBeDefined();

    const rawToken = "abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";
    const expectedHash = hashSessionToken(rawToken);
    const now = new Date("2026-10-05T12:00:00Z");
    const expiry = new Date("2026-11-05T12:00:00Z");

    const session = await sessionRepo.create({
      userId: user.id,
      tokenHash: expectedHash,
      createdAt: now,
      expiresAt: expiry,
    });
    expect(session.id).toBeDefined();

    const dbRow = await dbInstance.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, session.id))
      .then((rows) => rows[0]);

    expect(dbRow).toBeDefined();
    if (!dbRow) return;

    expect(dbRow.tokenHash).toBe(expectedHash);
    expect(dbRow.tokenHash).not.toBe(rawToken);
    expect(dbRow.tokenHash).toHaveLength(64);

    // Lookup session by hash
    const lookup = await sessionRepo.findByTokenHash(expectedHash);
    expect(lookup?.userId).toBe(user.id);

    // Test trimToNewest with distinct createdAt values
    const s2 = await sessionRepo.create({
      userId: user.id,
      tokenHash: "0000000000000000000000000000000000000000000000000000000000000002",
      createdAt: new Date("2026-10-05T13:00:00Z"),
      expiresAt: new Date("2026-11-05T13:00:00Z"),
    });
    const s3 = await sessionRepo.create({
      userId: user.id,
      tokenHash: "0000000000000000000000000000000000000000000000000000000000000003",
      createdAt: new Date("2026-10-05T14:00:00Z"),
      expiresAt: new Date("2026-11-05T14:00:00Z"),
    });

    // Trim to 2 newest (keeps s3 and s2, deletes s1)
    await sessionRepo.trimToNewest(user.id, 2);
    expect(await sessionRepo.findByTokenHash(expectedHash)).toBeNull();
    expect(await sessionRepo.findByTokenHash(s2.tokenHash)).not.toBeNull();
    expect(await sessionRepo.findByTokenHash(s3.tokenHash)).not.toBeNull();

    // Test trimToNewest with EQUAL createdAt values (deterministic count and order)
    const tieTime = new Date("2026-10-05T15:00:00Z");
    const tieExpiry = new Date("2026-11-05T15:00:00Z");
    await sessionRepo.create({
      userId: user.id,
      tokenHash: "111111111111111111111111111111111111111111111111111111111111111a",
      createdAt: tieTime,
      expiresAt: tieExpiry,
    });
    await sessionRepo.create({
      userId: user.id,
      tokenHash: "111111111111111111111111111111111111111111111111111111111111111b",
      createdAt: tieTime,
      expiresAt: tieExpiry,
    });

    // Now user has s2, s3, tA, tB (4 total). Trim to 2.
    await sessionRepo.trimToNewest(user.id, 2);
    const userRemaining = await dbInstance.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(userRemaining).toHaveLength(2);

    // Test expired cleanup: create expired session
    const expiredSession = await sessionRepo.create({
      userId: user.id,
      tokenHash: "2222222222222222222222222222222222222222222222222222222222222222",
      createdAt: new Date("2026-09-01T10:00:00Z"),
      expiresAt: new Date("2026-10-01T10:00:00Z"),
    });
    expect(await sessionRepo.findByTokenHash(expiredSession.tokenHash)).not.toBeNull();
    await sessionRepo.deleteExpiredForUser(user.id, new Date("2026-10-05T00:00:00Z"));
    expect(await sessionRepo.findByTokenHash(expiredSession.tokenHash)).toBeNull();

    // Test CASCADE delete: deleting the user deletes all their sessions
    await dbInstance.db.delete(users).where(eq(users.id, user.id));
    const cascaded = await dbInstance.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(cascaded).toHaveLength(0);
  });

  // Test 3: Full flow with real repos + real argon2
  it("3. Full flow with real repos and real argon2: register -> me -> logout -> me 401; login; wrong pw; duplicate case-insensitive 409", async () => {
    const userRepo = createDrizzleUserRepo(dbInstance.db);
    const sessionRepo = createDrizzleSessionRepo(dbInstance.db);
    const hasher = createArgon2Hasher();

    const service = createAuthService({
      users: userRepo,
      sessions: sessionRepo,
      hasher,
      config: { sessionTtlDays: 30 },
    });

    const routes = createAuthRoutes({
      service,
      config: intTestConfig,
      getClientAddress: () => "127.0.0.1",
    });

    // 1. Register -> 201
    const regRes = await routes.request("/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "fullflow@example.com", password: "securePassword123!" }),
    });
    expect(regRes.status).toBe(201);
    const regBody = await regRes.json();
    expect(regBody.user.email).toBe("fullflow@example.com");

    const setCookie = regRes.headers.get("set-cookie") ?? "";
    const cookieHeader = setCookie.split(";")[0] ?? ""; // "lumio_session=..."

    // 2. /me -> 200 { user }
    const meRes = await routes.request("/me", {
      headers: { Cookie: cookieHeader },
    });
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.user.id).toBe(regBody.user.id);
    expect(meBody.user.email).toBe("fullflow@example.com");

    // 3. Logout -> 204
    const logoutRes = await routes.request("/logout", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        Cookie: cookieHeader,
      },
    });
    expect(logoutRes.status).toBe(204);

    // 4. /me after logout -> 401
    const meAfterLogout = await routes.request("/me", {
      headers: { Cookie: cookieHeader },
    });
    expect(meAfterLogout.status).toBe(401);

    // 5. Login after logout with correct password -> 200
    const loginRes = await routes.request("/login", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "fullflow@example.com", password: "securePassword123!" }),
    });
    expect(loginRes.status).toBe(200);

    // 6. Login with wrong password -> 401
    const wrongPwRes = await routes.request("/login", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "fullflow@example.com", password: "incorrectPassword999" }),
    });
    expect(wrongPwRes.status).toBe(401);
    expect(await wrongPwRes.json()).toEqual({
      error: { code: "invalid-credentials", message: "Invalid email or password" },
    });

    // 7. Duplicate email via different casing -> 409
    const dupRes = await routes.request("/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "FullFlow@Example.COM", password: "securePassword123!" }),
    });
    expect(dupRes.status).toBe(409);
    expect(await dupRes.json()).toEqual({
      error: { code: "email-taken", message: "Email is already registered" },
    });
  });

  // Test 4: Concurrency race: two simultaneous registers of same email on separate pool connections -> exactly one 201 and one 409, repeated 5 times
  it("4. Race condition: simultaneous register of same email across connections yields exactly one 201 and one 409 (5 runs)", async () => {
    const userRepo = createDrizzleUserRepo(dbInstance.db);
    const sessionRepo = createDrizzleSessionRepo(dbInstance.db);
    const hasher = createArgon2Hasher();

    for (let run = 1; run <= 5; run++) {
      const email = `race_${run}_${Date.now()}@example.com`;
      const password = "securePassword123!";

      const service = createAuthService({
        users: userRepo,
        sessions: sessionRepo,
        hasher,
        config: { sessionTtlDays: 30 },
      });

      const routes = createAuthRoutes({
        service,
        config: intTestConfig,
        getClientAddress: () => `127.0.0.${run}`,
      });

      const makeRegisterReq = () =>
        routes.request("/register", {
          method: "POST",
          headers: {
            Origin: "http://localhost:5173",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });

      // Fire both requests simultaneously
      const [res1, res2] = await Promise.all([makeRegisterReq(), makeRegisterReq()]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses, `Run ${run} failed concurrency race assertion`).toEqual([201, 409]);
    }
  });

  // Test 5: DB agreement property (fast-check): for emails that validateEmail accepts, creating a user never violates DB email checks
  it("5. DB agreement property: validateEmail acceptance implies DB constraint compliance", async () => {
    const userRepo = createDrizzleUserRepo(dbInstance.db);
    let runCount = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        async (email) => {
          const validated = validateEmail(email);
          if (!validated.ok) {
            return; // Only test emails accepted by validateEmail
          }

          runCount++;
          // Ensure email is unique for this test iteration
          const uniqueEmail = `fc_${runCount}_${validated.email}`;
          // Verify uniqueEmail is also accepted
          const v2 = validateEmail(uniqueEmail);
          if (!v2.ok) return;

          // Inserting into DB must never violate users_email_normalized_check or users_email_shape_check
          const created = await userRepo.create({
            email: v2.email,
            passwordHash: "dummyHashForProperty123",
          });

          expect(created.id).toBeDefined();
          expect(created.email).toBe(v2.email);
        },
      ),
      { numRuns: 30 },
    );
  });

  // Test 6 (Addition 3): ComposeApp integration test with real lumio_test db and real hasher
  it("6. ComposeApp integration: builds production app through composeApp and verifies register -> me", async () => {
    const logError = vi.fn();
    const app = composeApp(intTestConfig, {
      db: dbInstance.db,
      logError,
    });

    const regRes = await app.request("/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "composed@example.com", password: "password12345" }),
    });

    expect(regRes.status).toBe(201);
    const regBody = await regRes.json();
    expect(regBody.user.email).toBe("composed@example.com");

    const setCookie = regRes.headers.get("set-cookie") ?? "";
    const cookieHeader = setCookie.split(";")[0] ?? "";

    const meRes = await app.request("/api/auth/me", {
      headers: { Cookie: cookieHeader },
    });
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.user.email).toBe("composed@example.com");
    expect(logError).not.toHaveBeenCalled();
  });
});
