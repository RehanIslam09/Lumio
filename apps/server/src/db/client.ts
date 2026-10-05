import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export interface CreateDbOptions {
  logError?: (err: unknown) => void;
  max?: number;
}

export interface DbInstance {
  db: NodePgDatabase<Record<string, never>>;
  pool: Pool;
  close(): Promise<void>;
}

export function createDb(databaseUrl: string, options?: CreateDbOptions): DbInstance {
  const logError = options?.logError ?? console.error;
  const pool = new Pool({
    connectionString: databaseUrl,
    max: options?.max ?? 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });

  pool.on("error", (err: Error) => {
    logError(err);
  });

  const db = drizzle(pool);

  return {
    db,
    pool,
    async close() {
      await pool.end();
    },
  };
}
