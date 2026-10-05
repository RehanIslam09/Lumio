import { randomUUID } from "node:crypto";
import type { Project } from "@repo/schema";
import { and, count, desc, eq, max, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getPgError } from "../db/errors.js";
import { projects, projectVersions, users } from "../db/schema.js";
import {
  DocumentTooLargeError,
  type CreateWithFirstVersionResult,
  type DeleteOwnedResult,
  type GetLatestResult,
  type GetVersionResult,
  type ListVersionsResult,
  type ProjectRepo,
  type PublicProject,
  type SaveNewVersionResult,
} from "./repositories.js";

export function createDrizzleProjectRepo(db: NodePgDatabase): ProjectRepo {
  return {
    async createWithFirstVersion(params: {
      ownerId: string;
      document: Project;
      schemaVersion: number;
      maxProjectsPerUser: number;
      now: Date;
    }): Promise<CreateWithFirstVersionResult> {
      return await db.transaction(async (tx) => {
        // Lock caller's users row with FOR NO KEY UPDATE
        const userLock = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, params.ownerId))
          .for("no key update");

        if (userLock.length === 0) {
          return { ok: false, code: "project-limit-reached" };
        }

        // Count current projects owned by caller
        const [countRow] = await tx
          .select({ count: count(projects.id) })
          .from(projects)
          .where(eq(projects.ownerId, params.ownerId));

        const currentCount = Number(countRow?.count ?? 0);
        if (currentCount >= params.maxProjectsPerUser) {
          return { ok: false, code: "project-limit-reached" };
        }

        const projectId = randomUUID();
        const versionId = randomUUID();

        try {
          await tx.insert(projects).values({
            id: projectId,
            ownerId: params.ownerId,
            name: params.document.name,
            createdAt: params.now,
            updatedAt: params.now,
          });

          await tx.insert(projectVersions).values({
            id: versionId,
            projectId,
            versionNumber: 1,
            schemaVersion: params.schemaVersion,
            document: params.document,
            createdBy: params.ownerId,
            createdAt: params.now,
          });
        } catch (err) {
          const pgErr = getPgError(err);
          if (
            pgErr?.code === "23514" &&
            pgErr.constraint === "project_versions_document_size_check"
          ) {
            throw new DocumentTooLargeError();
          }
          throw err;
        }

        return {
          ok: true,
          project: {
            id: projectId,
            name: params.document.name,
            createdAt: params.now.toISOString(),
            updatedAt: params.now.toISOString(),
            latestVersion: 1,
          },
          version: {
            versionNumber: 1,
            schemaVersion: params.schemaVersion,
            createdAt: params.now.toISOString(),
          },
        };
      });
    },

    async saveNewVersion(params: {
      id: string;
      ownerId: string;
      baseVersion: number;
      schemaVersion: number;
      document: Project;
      now: Date;
    }): Promise<SaveNewVersionResult> {
      return await db.transaction(async (tx) => {
        // Lock project row FOR NO KEY UPDATE with owner check in SQL
        const lockedProjects = await tx
          .select({
            id: projects.id,
            name: projects.name,
            createdAt: projects.createdAt,
          })
          .from(projects)
          .where(and(eq(projects.id, params.id), eq(projects.ownerId, params.ownerId)))
          .for("no key update");

        const lockedProject = lockedProjects[0];
        if (!lockedProject) {
          return { ok: false, code: "not-found" };
        }

        // Read max(version_number) AFTER the lock is acquired
        const [maxRow] = await tx
          .select({ maxVersion: max(projectVersions.versionNumber) })
          .from(projectVersions)
          .where(eq(projectVersions.projectId, params.id));

        const currentVersion = maxRow?.maxVersion ?? 0;
        if (params.baseVersion !== currentVersion) {
          return {
            ok: false,
            code: "version-conflict",
            currentVersion,
          };
        }

        const nextVersion = currentVersion + 1;
        const versionId = randomUUID();

        try {
          await tx.insert(projectVersions).values({
            id: versionId,
            projectId: params.id,
            versionNumber: nextVersion,
            schemaVersion: params.schemaVersion,
            document: params.document,
            createdBy: params.ownerId,
            createdAt: params.now,
          });

          await tx
            .update(projects)
            .set({
              name: params.document.name,
              updatedAt: params.now,
            })
            .where(eq(projects.id, params.id));
        } catch (err) {
          const pgErr = getPgError(err);
          if (
            pgErr?.code === "23505" &&
            pgErr.constraint === "project_versions_project_version_unique"
          ) {
            return {
              ok: false,
              code: "version-conflict",
              currentVersion: nextVersion,
            };
          }
          if (
            pgErr?.code === "23514" &&
            pgErr.constraint === "project_versions_document_size_check"
          ) {
            throw new DocumentTooLargeError();
          }
          throw err;
        }

        return {
          ok: true,
          project: {
            id: params.id,
            name: params.document.name,
            createdAt: lockedProject.createdAt.toISOString(),
            updatedAt: params.now.toISOString(),
            latestVersion: nextVersion,
          },
          version: {
            versionNumber: nextVersion,
            schemaVersion: params.schemaVersion,
            createdAt: params.now.toISOString(),
          },
        };
      });
    },

    async listForOwner(ownerId: string, limit = 200): Promise<PublicProject[]> {
      const rows = await db
        .select({
          id: projects.id,
          name: projects.name,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
          latestVersion: sql<number>`coalesce(max(${projectVersions.versionNumber}), 1)::integer`,
        })
        .from(projects)
        .leftJoin(projectVersions, eq(projects.id, projectVersions.projectId))
        .where(eq(projects.ownerId, ownerId))
        .groupBy(projects.id, projects.name, projects.createdAt, projects.updatedAt)
        .orderBy(desc(projects.updatedAt), desc(projects.id))
        .limit(limit);

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        latestVersion: Number(r.latestVersion),
      }));
    },

    async getLatest(params: {
      id: string;
      ownerId: string;
    }): Promise<GetLatestResult> {
      const rows = await db
        .select({
          id: projects.id,
          name: projects.name,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
          versionNumber: projectVersions.versionNumber,
          schemaVersion: projectVersions.schemaVersion,
          versionCreatedAt: projectVersions.createdAt,
          document: projectVersions.document,
        })
        .from(projects)
        .innerJoin(projectVersions, eq(projects.id, projectVersions.projectId))
        .where(and(eq(projects.id, params.id), eq(projects.ownerId, params.ownerId)))
        .orderBy(desc(projectVersions.versionNumber))
        .limit(1);

      const row = rows[0];
      if (!row) {
        return { ok: false, code: "not-found" };
      }

      return {
        ok: true,
        project: {
          id: row.id,
          name: row.name,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          latestVersion: row.versionNumber,
        },
        version: {
          versionNumber: row.versionNumber,
          schemaVersion: row.schemaVersion,
          createdAt: row.versionCreatedAt.toISOString(),
        },
        document: row.document as Project,
      };
    },

    async listVersions(params: {
      id: string;
      ownerId: string;
      limit?: number;
    }): Promise<ListVersionsResult> {
      const limit = params.limit ?? 200;
      const projectRows = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, params.id), eq(projects.ownerId, params.ownerId)))
        .limit(1);

      if (projectRows.length === 0) {
        return { ok: false, code: "not-found" };
      }

      const rows = await db
        .select({
          versionNumber: projectVersions.versionNumber,
          schemaVersion: projectVersions.schemaVersion,
          createdAt: projectVersions.createdAt,
          createdBy: projectVersions.createdBy,
        })
        .from(projectVersions)
        .where(eq(projectVersions.projectId, params.id))
        .orderBy(desc(projectVersions.versionNumber))
        .limit(limit);

      return {
        ok: true,
        versions: rows.map((r) => ({
          versionNumber: r.versionNumber,
          schemaVersion: r.schemaVersion,
          createdAt: r.createdAt.toISOString(),
          createdByMe: r.createdBy === params.ownerId,
        })),
      };
    },

    async getVersion(params: {
      id: string;
      ownerId: string;
      versionNumber: number;
    }): Promise<GetVersionResult> {
      const rows = await db
        .select({
          versionNumber: projectVersions.versionNumber,
          schemaVersion: projectVersions.schemaVersion,
          createdAt: projectVersions.createdAt,
          document: projectVersions.document,
        })
        .from(projects)
        .innerJoin(projectVersions, eq(projects.id, projectVersions.projectId))
        .where(
          and(
            eq(projects.id, params.id),
            eq(projects.ownerId, params.ownerId),
            eq(projectVersions.versionNumber, params.versionNumber),
          ),
        )
        .limit(1);

      const row = rows[0];
      if (!row) {
        return { ok: false, code: "not-found" };
      }

      return {
        ok: true,
        version: {
          versionNumber: row.versionNumber,
          schemaVersion: row.schemaVersion,
          createdAt: row.createdAt.toISOString(),
        },
        document: row.document as Project,
      };
    },

    async deleteOwned(params: {
      id: string;
      ownerId: string;
    }): Promise<DeleteOwnedResult> {
      return await db.transaction(async (tx) => {
        const locked = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, params.id), eq(projects.ownerId, params.ownerId)))
          .for("no key update");

        if (locked.length === 0) {
          return { ok: false, code: "not-found" };
        }

        await tx.delete(projects).where(eq(projects.id, params.id));

        return { ok: true };
      });
    },
  };
}
