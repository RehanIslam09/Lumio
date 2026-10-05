import { Algorithm, hash, verify } from "@node-rs/argon2";

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

// Algorithm.Argon2id === 2 per @node-rs/argon2 index.d.ts line 19
export const ARGON2ID_ALGORITHM: number = Algorithm.Argon2id ?? 2;

export const ARGON2_CONFIG = {
  algorithm: ARGON2ID_ALGORITHM,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function createArgon2Hasher(): PasswordHasher {
  return {
    async hash(password: string): Promise<string> {
      return hash(password, ARGON2_CONFIG);
    },
    async verify(hashStr: string, password: string): Promise<boolean> {
      try {
        return await verify(hashStr, password, ARGON2_CONFIG);
      } catch {
        return false;
      }
    },
  };
}
