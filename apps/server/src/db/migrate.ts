import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export async function runMigrations(db: NodePgDatabase<Record<string, never>>): Promise<void> {
  const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
  await migrate(db, { migrationsFolder });
}
