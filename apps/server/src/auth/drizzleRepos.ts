import { and, desc, eq, lte, notInArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { EmailTakenError, getPgError } from "../db/errors.js";
import { sessions, users } from "../db/schema.js";
import type {
  CreateSessionInput,
  CreateUserInput,
  SessionLookup,
  SessionRecord,
  SessionRepo,
  UserPublic,
  UserRecord,
  UserRepo,
} from "./repositories.js";

export function createDrizzleUserRepo(db: NodePgDatabase): UserRepo {
  return {
    async create(input: CreateUserInput): Promise<UserPublic> {
      try {
        const rows = await db
          .insert(users)
          .values({
            email: input.email,
            passwordHash: input.passwordHash,
          })
          .returning({
            id: users.id,
            email: users.email,
          });

        const row = rows[0];
        if (!row) {
          throw new Error("Failed to insert user");
        }
        return row;
      } catch (err) {
        const pgErr = getPgError(err);
        if (pgErr?.code === "23505" && pgErr.constraint === "users_email_unique") {
          throw new EmailTakenError();
        }
        throw err;
      }
    },

    async findByEmail(email: string): Promise<UserRecord | null> {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      return rows[0] ?? null;
    },

    async findPublicById(id: string): Promise<UserPublic | null> {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return rows[0] ?? null;
    },
  };
}

export function createDrizzleSessionRepo(db: NodePgDatabase): SessionRepo {
  return {
    async create(input: CreateSessionInput): Promise<SessionRecord> {
      const rows = await db
        .insert(sessions)
        .values({
          userId: input.userId,
          tokenHash: input.tokenHash,
          createdAt: input.createdAt,
          expiresAt: input.expiresAt,
        })
        .returning({
          id: sessions.id,
          userId: sessions.userId,
          tokenHash: sessions.tokenHash,
          createdAt: sessions.createdAt,
          expiresAt: sessions.expiresAt,
        });

      const row = rows[0];
      if (!row) {
        throw new Error("Failed to insert session");
      }
      return row;
    },

    async findByTokenHash(hash: string): Promise<SessionLookup | null> {
      const rows = await db
        .select({
          id: sessions.id,
          userId: sessions.userId,
          expiresAt: sessions.expiresAt,
        })
        .from(sessions)
        .where(eq(sessions.tokenHash, hash))
        .limit(1);

      return rows[0] ?? null;
    },

    async deleteByTokenHash(hash: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.tokenHash, hash));
    },

    async deleteExpiredForUser(userId: string, now: Date): Promise<void> {
      await db
        .delete(sessions)
        .where(and(eq(sessions.userId, userId), lte(sessions.expiresAt, now)));
    },

    async trimToNewest(userId: string, keep: number): Promise<void> {
      if (keep <= 0) {
        await db.delete(sessions).where(eq(sessions.userId, userId));
        return;
      }

      const keepRows = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.userId, userId))
        .orderBy(desc(sessions.createdAt), desc(sessions.id))
        .limit(keep);

      if (keepRows.length < keep) {
        return;
      }

      const keepIds = keepRows.map((r) => r.id);
      await db
        .delete(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            notInArray(sessions.id, keepIds),
          ),
        );
    },
  };
}
