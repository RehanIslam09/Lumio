import crypto from "node:crypto";
import { EmailTakenError } from "../db/errors.js";
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

export function createFakeUserRepo(): UserRepo & {
  users: Map<string, UserRecord>;
  usersByEmail: Map<string, UserRecord>;
} {
  const users = new Map<string, UserRecord>();
  const usersByEmail = new Map<string, UserRecord>();

  return {
    users,
    usersByEmail,
    async create(input: CreateUserInput): Promise<UserPublic> {
      if (usersByEmail.has(input.email)) {
        throw new EmailTakenError();
      }
      const id = crypto.randomUUID();
      const record: UserRecord = {
        id,
        email: input.email,
        passwordHash: input.passwordHash,
      };
      users.set(id, record);
      usersByEmail.set(input.email, record);
      return { id, email: input.email };
    },

    async findByEmail(email: string): Promise<UserRecord | null> {
      return usersByEmail.get(email) ?? null;
    },

    async findPublicById(id: string): Promise<UserPublic | null> {
      const u = users.get(id);
      if (!u) return null;
      return { id: u.id, email: u.email };
    },
  };
}

export function createFakeSessionRepo(): SessionRepo & {
  sessions: Map<string, SessionRecord>;
} {
  const sessions = new Map<string, SessionRecord>();

  return {
    sessions,
    async create(input: CreateSessionInput): Promise<SessionRecord> {
      const id = crypto.randomUUID();
      const record: SessionRecord = {
        id,
        userId: input.userId,
        tokenHash: input.tokenHash,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
      };
      sessions.set(id, record);
      return record;
    },

    async findByTokenHash(hash: string): Promise<SessionLookup | null> {
      for (const s of sessions.values()) {
        if (s.tokenHash === hash) {
          return { id: s.id, userId: s.userId, expiresAt: s.expiresAt };
        }
      }
      return null;
    },

    async deleteByTokenHash(hash: string): Promise<void> {
      for (const [id, s] of sessions.entries()) {
        if (s.tokenHash === hash) {
          sessions.delete(id);
          return;
        }
      }
    },

    async deleteExpiredForUser(userId: string, now: Date): Promise<void> {
      for (const [id, s] of sessions.entries()) {
        if (s.userId === userId && s.expiresAt.getTime() <= now.getTime()) {
          sessions.delete(id);
        }
      }
    },

    async trimToNewest(userId: string, keep: number): Promise<void> {
      if (keep <= 0) {
        for (const [id, s] of sessions.entries()) {
          if (s.userId === userId) {
            sessions.delete(id);
          }
        }
        return;
      }

      // Collect user sessions
      const userSessions = Array.from(sessions.values()).filter(
        (s) => s.userId === userId,
      );

      // Order by createdAt DESC, then id DESC
      userSessions.sort((a, b) => {
        const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
        if (timeDiff !== 0) {
          return timeDiff;
        }
        return b.id.localeCompare(a.id);
      });

      // Keep first `keep`
      const toKeep = new Set(userSessions.slice(0, keep).map((s) => s.id));
      for (const s of userSessions) {
        if (!toKeep.has(s.id)) {
          sessions.delete(s.id);
        }
      }
    },
  };
}
