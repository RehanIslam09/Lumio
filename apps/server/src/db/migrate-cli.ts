import { parseConfig } from "../config.js";
import { createDb } from "./client.js";
import { runMigrations } from "./migrate.js";

async function main(): Promise<void> {
  const configResult = parseConfig(process.env);
  if (!configResult.ok) {
    console.error("Configuration error:", configResult.errors.join(", "));
    process.exit(1);
  }

  const { db, close } = createDb(configResult.config.databaseUrl, {
    logError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Database error during migration:", msg);
    },
  });

  try {
    await runMigrations(db);
    console.log("Migrations applied");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Migration failed:", msg);
    process.exitCode = 1;
  } finally {
    await close();
  }
}

void main();
