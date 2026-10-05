import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Mirrors the web client's 5MB file persistence limit (MAX_FILE_BYTES in apps/web);
 * isolated here to avoid cross-package imports from apps/web.
 */
export const MAX_DOCUMENT_BYTES = 5_000_000;

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("users_email_unique").on(t.email),
    check("users_email_normalized_check", sql`"email" = lower(btrim("email"))`),
    check(
      "users_email_shape_check",
      sql`char_length("email") between 3 and 254 and position('@' in "email") > 1`
    ),
    check("users_password_hash_not_empty_check", sql`char_length("password_hash") > 0`),
  ]
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "projects_owner_id_fkey",
      columns: [t.ownerId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
    check(
      "projects_name_length_check",
      sql`char_length(btrim("name")) between 1 and 200`
    ),
    index("projects_owner_updated_idx").on(t.ownerId, t.updatedAt.desc()),
  ]
);

export const projectVersions = pgTable(
  "project_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    document: jsonb("document").$type<unknown>().notNull(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "project_versions_project_id_fkey",
      columns: [t.projectId],
      foreignColumns: [projects.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "project_versions_created_by_fkey",
      columns: [t.createdBy],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    unique("project_versions_project_version_unique").on(t.projectId, t.versionNumber),
    check("project_versions_version_number_check", sql`"version_number" >= 1`),
    check("project_versions_schema_version_check", sql`"schema_version" >= 1`),
    check("project_versions_document_object_check", sql`jsonb_typeof("document") = 'object'`),
    check(
      "project_versions_document_size_check",
      sql`octet_length("document"::text) <= ${sql.raw(String(MAX_DOCUMENT_BYTES))}`
    ),
    index("project_versions_created_by_idx").on(t.createdBy),
  ]
);
