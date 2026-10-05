import process from "node:process";
import { serve } from "@hono/node-server";
import { parseConfig } from "./config.js";
import { composeApp } from "./compose.js";
import { createDb } from "./db/client.js";

const result = parseConfig(process.env);
if (!result.ok) {
  console.error("Configuration validation failed:");
  for (const error of result.errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

const config = result.config;

const logError = (err: unknown) => {
  console.error("Unhandled server error:", err);
};

const dbInstance = createDb(config.databaseUrl, { logError });

const app = composeApp(config, {
  db: dbInstance.db,
  logError,
});

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`Server listening on http://localhost:${info.port} (${config.nodeEnv})`);
  },
);

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, closing server...`);
  server.close(async (err?: Error) => {
    if (err) {
      console.error("Error during server shutdown:", err);
    }
    try {
      await dbInstance.close();
      console.log("Database pool closed.");
    } catch (dbErr) {
      console.error("Error closing database pool:", dbErr);
    }
    if (err) {
      process.exit(1);
    }
    console.log("Server closed cleanly.");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
