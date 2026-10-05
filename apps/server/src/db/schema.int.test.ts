import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import * as fc from "fast-check";
import { checkTestDatabaseUrl } from "./testSafety.js";
import { loadServerEnv } from "./testEnv.js";
import { createDb, type DbInstance } from "./client.js";
import { runMigrations } from "./migrate.js";
import { users, projects, projectVersions, MAX_DOCUMENT_BYTES } from "./schema.js";

// Helper to unwrap DrizzleQueryError and access SQLSTATE, constraint, column, and message
export function unwrapDbError(err: unknown): {
  code?: string;
  constraint?: string;
  message?: string;
  column?: string;
} {
  if (err && typeof err === "object") {
    const candidate = "cause" in err && err.cause && typeof err.cause === "object" ? err.cause : err;
    const { code, constraint, message, column } = candidate as {
      code?: string;
      constraint?: string;
      message?: string;
      column?: string;
    };
    return { code, constraint, message, column };
  }
  return {};
}

function assertDefined<T>(val: T, msg = "Expected value to be defined"): asserts val is NonNullable<T> {
  if (val === undefined || val === null) {
    throw new Error(msg);
  }
}

describe("Database integrity test suite", () => {
  let dbInstance: DbInstance;
  let testUrl: string;

  beforeAll(async () => {
    loadServerEnv();
    testUrl = process.env.TEST_DATABASE_URL ?? "";

    const safety = checkTestDatabaseUrl(testUrl, process.env.DATABASE_URL);
    if (!safety.ok) {
      throw new Error(
        `Test database safety check failed: ${safety.reason}. ` +
          "Integration tests require a running local PostgreSQL service and TEST_DATABASE_URL in apps/server/.env."
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
          "Ensure PostgreSQL service is running and TEST_DATABASE_URL in apps/server/.env is accessible."
      );
    }
  });

  afterAll(async () => {
    if (dbInstance) {
      await dbInstance.close();
    }
  });

  beforeEach(async () => {
    // Clean data between individual tests
    await dbInstance.pool.query("TRUNCATE users, projects, project_versions CASCADE;");
  });

  // Test 1: Introspection
  it("1. Introspection: tables, constraints, indexes, and FK rules exist as specified", async () => {
    // Tables exist in public
    const tablesRes = await dbInstance.pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'projects', 'project_versions');`
    );
    const tableNames = tablesRes.rows.map((r: { table_name: string }) => r.table_name).sort();
    expect(tableNames).toEqual(["project_versions", "projects", "users"]);

    // Constraints exist
    const constraintsRes = await dbInstance.pool.query(
      `SELECT conname FROM pg_catalog.pg_constraint WHERE connamespace = 'public'::regnamespace;`
    );
    const constraintNames = new Set(constraintsRes.rows.map((r: { conname: string }) => r.conname));
    const expectedConstraints = [
      "users_email_unique",
      "users_email_normalized_check",
      "users_email_shape_check",
      "users_password_hash_not_empty_check",
      "projects_owner_id_fkey",
      "projects_name_length_check",
      "project_versions_project_id_fkey",
      "project_versions_created_by_fkey",
      "project_versions_project_version_unique",
      "project_versions_version_number_check",
      "project_versions_schema_version_check",
      "project_versions_document_object_check",
      "project_versions_document_size_check",
    ];
    for (const con of expectedConstraints) {
      expect(constraintNames.has(con), `Missing constraint: ${con}`).toBe(true);
    }

    // Indexes exist
    const indexesRes = await dbInstance.pool.query(
      `SELECT indexname FROM pg_catalog.pg_indexes WHERE schemaname = 'public';`
    );
    const indexNames = new Set(indexesRes.rows.map((r: { indexname: string }) => r.indexname));
    expect(indexNames.has("projects_owner_updated_idx")).toBe(true);
    expect(indexNames.has("project_versions_created_by_idx")).toBe(true);

    // Foreign key delete rules: CASCADE, CASCADE, SET NULL
    const fkRes = await dbInstance.pool.query(
      `SELECT constraint_name, delete_rule FROM information_schema.referential_constraints WHERE constraint_schema = 'public';`
    );
    const fkRules = new Map(fkRes.rows.map((r: { constraint_name: string; delete_rule: string }) => [r.constraint_name, r.delete_rule]));
    expect(fkRules.get("projects_owner_id_fkey")).toBe("CASCADE");
    expect(fkRules.get("project_versions_project_id_fkey")).toBe("CASCADE");
    expect(fkRules.get("project_versions_created_by_fkey")).toBe("SET NULL");
  });

  // Test 2: Migration idempotency
  it("2. Migrations: running runMigrations a second time is a no-op", async () => {
    const countBefore = await dbInstance.pool.query(`SELECT count(*)::int as count FROM drizzle.__drizzle_migrations;`);
    await expect(runMigrations(dbInstance.db)).resolves.not.toThrow();
    const countAfter = await dbInstance.pool.query(`SELECT count(*)::int as count FROM drizzle.__drizzle_migrations;`);
    expect(countAfter.rows[0].count).toBe(countBefore.rows[0].count);
  });

  // Test 3: users constraints
  it("3. users: duplicate email, mixed case, invalid shape, and empty password checks", async () => {
    await dbInstance.db.insert(users).values({
      email: "writer@example.com",
      passwordHash: "hash123",
    });

    // Duplicate email -> 23505
    await expect(
      dbInstance.db.insert(users).values({ email: "writer@example.com", passwordHash: "h2" })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23505" && u.constraint === "users_email_unique";
    });

    // Mixed case email -> 23514 users_email_normalized_check
    await expect(
      dbInstance.db.insert(users).values({ email: "Writer@example.com", passwordHash: "h2" })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23514" && u.constraint === "users_email_normalized_check";
    });

    // Untrimmed email -> 23514 users_email_normalized_check
    await expect(
      dbInstance.db.insert(users).values({ email: " writer@example.com ", passwordHash: "h2" })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23514" && u.constraint === "users_email_normalized_check";
    });

    // Invalid email shape (no @) -> 23514 users_email_shape_check
    await expect(
      dbInstance.db.insert(users).values({ email: "notanemail", passwordHash: "h2" })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23514" && u.constraint === "users_email_shape_check";
    });

    // Invalid email shape (<3 chars) -> 23514 users_email_shape_check
    await expect(
      dbInstance.db.insert(users).values({ email: "@b", passwordHash: "h2" })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23514" && u.constraint === "users_email_shape_check";
    });

    // Empty password_hash -> 23514 users_password_hash_not_empty_check
    await expect(
      dbInstance.db.insert(users).values({ email: "valid@example.com", passwordHash: "" })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23514" && u.constraint === "users_password_hash_not_empty_check";
    });
  });

  // Test 4: projects constraints and cascades
  it("4. projects: name length checks, foreign key, and cascade delete on user", async () => {
    const [u] = await dbInstance.db
      .insert(users)
      .values({ email: "owner@example.com", passwordHash: "secret" })
      .returning();
    assertDefined(u);

    // Blank name -> 23514
    await expect(
      dbInstance.db.insert(projects).values({ ownerId: u.id, name: "" })
    ).rejects.toSatisfy((err: unknown) => {
      const unwrapped = unwrapDbError(err);
      return unwrapped.code === "23514" && unwrapped.constraint === "projects_name_length_check";
    });

    // Whitespace-only name -> 23514
    await expect(
      dbInstance.db.insert(projects).values({ ownerId: u.id, name: "    " })
    ).rejects.toSatisfy((err: unknown) => {
      const unwrapped = unwrapDbError(err);
      return unwrapped.code === "23514" && unwrapped.constraint === "projects_name_length_check";
    });

    // 201-char name -> 23514
    await expect(
      dbInstance.db.insert(projects).values({ ownerId: u.id, name: "a".repeat(201) })
    ).rejects.toSatisfy((err: unknown) => {
      const unwrapped = unwrapDbError(err);
      return unwrapped.code === "23514" && unwrapped.constraint === "projects_name_length_check";
    });

    // Nonexistent owner_id -> 23503 projects_owner_id_fkey
    await expect(
      dbInstance.db.insert(projects).values({ ownerId: "00000000-0000-0000-0000-000000000000", name: "P1" })
    ).rejects.toSatisfy((err: unknown) => {
      const unwrapped = unwrapDbError(err);
      return unwrapped.code === "23503" && unwrapped.constraint === "projects_owner_id_fkey";
    });

    // Valid project
    const [p] = await dbInstance.db.insert(projects).values({ ownerId: u.id, name: "Lumio Quest" }).returning();
    assertDefined(p);
    expect(p.id).toBeDefined();

    // Deleting the user deletes the user's projects (cascade)
    await dbInstance.pool.query("DELETE FROM users WHERE id = $1;", [u.id]);
    const afterDelete = await dbInstance.pool.query("SELECT * FROM projects WHERE id = $1;", [p.id]);
    expect(afterDelete.rowCount).toBe(0);
  });

  // Test 5: project_versions constraints and relations
  it("5. project_versions: version numbers, document types/sizes, and FK cascades", async () => {
    const [userA] = await dbInstance.db
      .insert(users)
      .values({ email: "usera@example.com", passwordHash: "h1" })
      .returning();
    assertDefined(userA);

    const [userB] = await dbInstance.db
      .insert(users)
      .values({ email: "userb@example.com", passwordHash: "h2" })
      .returning();
    assertDefined(userB);

    const [proj] = await dbInstance.db
      .insert(projects)
      .values({ ownerId: userA.id, name: "Project Alpha" })
      .returning();
    assertDefined(proj);

    // version_number 0 -> 23514
    await expect(
      dbInstance.db.insert(projectVersions).values({
        projectId: proj.id,
        versionNumber: 0,
        schemaVersion: 1,
        document: { title: "v0" },
      })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23514" && u.constraint === "project_versions_version_number_check";
    });

    // schema_version 0 -> 23514
    await expect(
      dbInstance.db.insert(projectVersions).values({
        projectId: proj.id,
        versionNumber: 1,
        schemaVersion: 0,
        document: { title: "v1" },
      })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23514" && u.constraint === "project_versions_schema_version_check";
    });

    // Document is array -> 23514
    await expect(
      dbInstance.db.insert(projectVersions).values({
        projectId: proj.id,
        versionNumber: 1,
        schemaVersion: 1,
        document: ["item"],
      })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23514" && u.constraint === "project_versions_document_object_check";
    });

    // Document is string -> 23514
    await expect(
      dbInstance.db.insert(projectVersions).values({
        projectId: proj.id,
        versionNumber: 1,
        schemaVersion: 1,
        document: "string-doc",
      })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23514" && u.constraint === "project_versions_document_object_check";
    });

    // Document is number -> 23514
    await expect(
      dbInstance.db.insert(projectVersions).values({
        projectId: proj.id,
        versionNumber: 1,
        schemaVersion: 1,
        document: 42,
      })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23514" && u.constraint === "project_versions_document_object_check";
    });

    // Real JSON null (sql`'null'::jsonb`) -> 23514 project_versions_document_object_check
    await expect(
      dbInstance.db.insert(projectVersions).values({
        projectId: proj.id,
        versionNumber: 1,
        schemaVersion: 1,
        document: sql`'null'::jsonb`,
      })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23514" && u.constraint === "project_versions_document_object_check";
    });

    // JavaScript null -> 23502 not-null violation on column "document"
    await expect(
      dbInstance.db.insert(projectVersions).values({
        projectId: proj.id,
        versionNumber: 1,
        schemaVersion: 1,
        document: null as unknown as Record<string, unknown>,
      })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23502" && u.column === "document";
    });

    // Size limit test: PostgreSQL jsonb::text representation of {"p": "..."} has 9-byte envelope
    // N = 4_999_991 produces exactly 5_000_000 bytes -> ACCEPTED
    const exact5MbDoc = { p: "a".repeat(MAX_DOCUMENT_BYTES - 9) };
    const [validVersion] = await dbInstance.db
      .insert(projectVersions)
      .values({
        projectId: proj.id,
        versionNumber: 1,
        schemaVersion: 1,
        document: exact5MbDoc,
        createdBy: userB.id,
      })
      .returning();
    assertDefined(validVersion);
    expect(validVersion.id).toBeDefined();

    // N = 4_999_992 produces exactly 5_000_001 bytes -> REJECTED with project_versions_document_size_check
    const over5MbDoc = { p: "a".repeat(MAX_DOCUMENT_BYTES - 8) };
    await expect(
      dbInstance.db.insert(projectVersions).values({
        projectId: proj.id,
        versionNumber: 2,
        schemaVersion: 1,
        document: over5MbDoc,
      })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23514" && u.constraint === "project_versions_document_size_check";
    });

    // Nonexistent project_id -> 23503
    await expect(
      dbInstance.db.insert(projectVersions).values({
        projectId: "00000000-0000-0000-0000-000000000000",
        versionNumber: 2,
        schemaVersion: 1,
        document: { title: "v2" },
      })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23503" && u.constraint === "project_versions_project_id_fkey";
    });

    // Duplicate (project_id, version_number) -> 23505
    await expect(
      dbInstance.db.insert(projectVersions).values({
        projectId: proj.id,
        versionNumber: 1,
        schemaVersion: 1,
        document: { title: "duplicate v1" },
      })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      return u.code === "23505" && u.constraint === "project_versions_project_version_unique";
    });

    // Deleting collaborator user B leaves version's created_by as NULL (ON DELETE SET NULL)
    await dbInstance.pool.query("DELETE FROM users WHERE id = $1;", [userB.id]);
    const pvAfterUserB = await dbInstance.pool.query("SELECT created_by FROM project_versions WHERE id = $1;", [
      validVersion.id,
    ]);
    expect(pvAfterUserB.rows[0].created_by).toBeNull();

    // Deleting project deletes its versions (ON DELETE CASCADE)
    await dbInstance.pool.query("DELETE FROM projects WHERE id = $1;", [proj.id]);
    const pvAfterProj = await dbInstance.pool.query("SELECT * FROM project_versions WHERE id = $1;", [validVersion.id]);
    expect(pvAfterProj.rowCount).toBe(0);
  });

  // Test 6: Concurrency
  it("6. CONCURRENCY: race between two inserts of same version on separate pool connections", async () => {
    const [user] = await dbInstance.db
      .insert(users)
      .values({ email: "race@example.com", passwordHash: "hash" })
      .returning();
    assertDefined(user);

    const [proj] = await dbInstance.db
      .insert(projects)
      .values({ ownerId: user.id, name: "Race Project" })
      .returning();
    assertDefined(proj);

    // Repeat race 20 times with distinct version numbers
    for (let i = 1; i <= 20; i++) {
      const vNum = 100 + i;

      // Check out two separate pool connections explicitly
      const client1 = await dbInstance.pool.connect();
      const client2 = await dbInstance.pool.connect();

      try {
        const query = `
          INSERT INTO project_versions (project_id, version_number, schema_version, document)
          VALUES ($1, $2, 1, '{"race": true}'::jsonb);
        `;

        const [r1, r2] = await Promise.allSettled([
          client1.query(query, [proj.id, vNum]),
          client2.query(query, [proj.id, vNum]),
        ]);

        const fulfilled = [r1, r2].filter((r) => r.status === "fulfilled");
        const rejected = [r1, r2].filter((r) => r.status === "rejected");

        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);

        const reason = (rejected[0] as PromiseRejectedResult).reason;
        const u = unwrapDbError(reason);
        expect(u.code).toBe("23505");
      } finally {
        client1.release();
        client2.release();
      }
    }
  });

  // Test 7: Timestamps
  it("7. Timestamps: created_at / updated_at defaults are set by database and are timestamptz", async () => {
    // Introspection check for column data types
    const colsRes = await dbInstance.pool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'projects' AND column_name IN ('created_at', 'updated_at');`
    );
    for (const row of colsRes.rows as { column_name: string; data_type: string }[]) {
      expect(row.data_type).toBe("timestamp with time zone");
    }

    const [user] = await dbInstance.db
      .insert(users)
      .values({ email: "ts@example.com", passwordHash: "hash" })
      .returning();
    assertDefined(user);

    // Insert project omitting created_at and updated_at
    const [proj] = await dbInstance.db
      .insert(projects)
      .values({ ownerId: user.id, name: "Timestamp Test" })
      .returning();
    assertDefined(proj);

    expect(proj.createdAt).toBeInstanceOf(Date);
    expect(proj.updatedAt).toBeInstanceOf(Date);
    const nowMs = Date.now();
    expect(Math.abs(proj.createdAt.getTime() - nowMs)).toBeLessThan(60_000);
    expect(Math.abs(proj.updatedAt.getTime() - nowMs)).toBeLessThan(60_000);
  });

  // Test 8: JSONB round trip property (fast-check)
  it("8. JSONB round trip property: stored and read document deep-equals input under 3s", async () => {
    const [user] = await dbInstance.db
      .insert(users)
      .values({ email: "jsonb@example.com", passwordHash: "h" })
      .returning();
    assertDefined(user);

    const [proj] = await dbInstance.db
      .insert(projects)
      .values({ ownerId: user.id, name: "JSONB Project" })
      .returning();
    assertDefined(proj);

    // String generator excluding \u0000
    const safeString = fc
      .string()
      .map((s) => s.replace(/\u0000/g, ""));

    // JSON value generator mapping -0 to 0 (JSON cannot distinguish -0 from 0)
    const jsonValue: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
      leaf: fc.oneof(
        safeString,
        fc.integer(),
        fc.double({ noNaN: true, noDefaultInfinity: true }).map((n) => (Object.is(n, -0) ? 0 : n)),
        fc.boolean(),
        fc.constant(null)
      ),
      node: fc.oneof(
        tie("leaf"),
        fc.array(tie("node"), { maxLength: 4 }),
        fc.dictionary(safeString, tie("node"), { maxKeys: 4, noNullPrototype: true })
      ),
    })).node;

    // Use noNullPrototype: true per fast-check types (fast-check.d.ts:1912)
    const jsonObject = fc.dictionary(safeString, jsonValue, {
      minKeys: 1,
      maxKeys: 6,
      noNullPrototype: true,
    });

    let runCounter = 0;
    const startTime = Date.now();

    await fc.assert(
      fc.asyncProperty(jsonObject, async (doc) => {
        runCounter++;
        const versionNum = runCounter;

        // Normalize with JSON.parse(JSON.stringify(doc)) before inserting
        const normalized = JSON.parse(JSON.stringify(doc));

        await dbInstance.db.insert(projectVersions).values({
          projectId: proj.id,
          versionNumber: versionNum,
          schemaVersion: 1,
          document: normalized,
        });

        const res = await dbInstance.pool.query(
          "SELECT document FROM project_versions WHERE project_id = $1 AND version_number = $2;",
          [proj.id, versionNum]
        );

        expect(res.rows[0].document).toEqual(normalized);
      }),
      { numRuns: 40 }
    );

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(3000);
  });

  // Test 9: PIN U+0000 behavior
  it("9. PIN U+0000 behavior: PostgreSQL rejects \\u0000 in jsonb strings with SQLSTATE 22P05", async () => {
    const [user] = await dbInstance.db
      .insert(users)
      .values({ email: "pin@example.com", passwordHash: "h" })
      .returning();
    assertDefined(user);

    const [proj] = await dbInstance.db
      .insert(projects)
      .values({ ownerId: user.id, name: "PIN Project" })
      .returning();
    assertDefined(proj);

    const docWithNullChar = { text: "hello\u0000world" };

    await expect(
      dbInstance.db.insert(projectVersions).values({
        projectId: proj.id,
        versionNumber: 1,
        schemaVersion: 1,
        document: docWithNullChar,
      })
    ).rejects.toSatisfy((err: unknown) => {
      const u = unwrapDbError(err);
      // PostgreSQL throws 22P05 (unsupported Unicode escape sequence)
      return u.code === "22P05";
    });
  });

  // Test 10: SQL safety
  it("10. SQL safety: query with hostile string is stored verbatim and table is not dropped", async () => {
    const [user] = await dbInstance.db
      .insert(users)
      .values({ email: "sqli@example.com", passwordHash: "h" })
      .returning();
    assertDefined(user);

    const hostileName = "'; DROP TABLE users; --";
    const [proj] = await dbInstance.db
      .insert(projects)
      .values({ ownerId: user.id, name: hostileName })
      .returning();
    assertDefined(proj);

    expect(proj.name).toBe(hostileName);

    // Verify users table still exists and holds the user record
    const userRes = await dbInstance.pool.query("SELECT * FROM users WHERE id = $1;", [user.id]);
    expect(userRes.rowCount).toBe(1);
  });

  // Test 11: Pinned test for hostile own keys
  it("11. Hostile keys: documents containing own keys __proto__, constructor, and prototype round-trip intact", async () => {
    const [user] = await dbInstance.db
      .insert(users)
      .values({ email: "hostilekeys@example.com", passwordHash: "h" })
      .returning();
    assertDefined(user);

    const [proj] = await dbInstance.db
      .insert(projects)
      .values({ ownerId: user.id, name: "Hostile Keys Project" })
      .returning();
    assertDefined(proj);

    const hostileDoc = JSON.parse(
      '{"__proto__": "custom-proto", "constructor": "custom-ctor", "prototype": "custom-proto-prop"}'
    );

    await dbInstance.db.insert(projectVersions).values({
      projectId: proj.id,
      versionNumber: 1,
      schemaVersion: 1,
      document: hostileDoc,
    });

    const res = await dbInstance.pool.query(
      "SELECT document FROM project_versions WHERE project_id = $1 AND version_number = 1;",
      [proj.id]
    );

    const readDoc = res.rows[0].document as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(readDoc, "__proto__")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(readDoc, "constructor")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(readDoc, "prototype")).toBe(true);
    expect(readDoc["__proto__"]).toBe("custom-proto");
    expect(readDoc["constructor"]).toBe("custom-ctor");
    expect(readDoc["prototype"]).toBe("custom-proto-prop");
    expect(readDoc).toEqual(hostileDoc);
  });
});
