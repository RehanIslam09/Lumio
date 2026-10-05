export interface UserPublic {
  id: string;
  email: string;
}

export interface UserRecord extends UserPublic {
  passwordHash: string;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

export interface UserRepo {
  create(input: CreateUserInput): Promise<UserPublic>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findPublicById(id: string): Promise<UserPublic | null>;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface CreateSessionInput {
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface SessionLookup {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface SessionRepo {
  create(input: CreateSessionInput): Promise<SessionRecord>;
  findByTokenHash(hash: string): Promise<SessionLookup | null>;
  deleteByTokenHash(hash: string): Promise<void>;
  deleteExpiredForUser(userId: string, now: Date): Promise<void>;
  trimToNewest(userId: string, keep: number): Promise<void>;
}
