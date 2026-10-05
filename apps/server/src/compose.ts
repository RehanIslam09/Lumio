import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Hono } from "hono";
import { createApp } from "./app.js";
import { createDrizzleSessionRepo, createDrizzleUserRepo } from "./auth/drizzleRepos.js";
import { createArgon2Hasher } from "./auth/passwordHasher.js";
import { defaultGetClientAddress } from "./auth/routes.js";
import { createAuthService } from "./auth/service.js";
import type { Config } from "./config.js";

export interface ComposeAppDependencies {
  db: NodePgDatabase;
  logError: (err: unknown) => void;
}

export function composeApp(config: Config, deps: ComposeAppDependencies): Hono {
  const users = createDrizzleUserRepo(deps.db);
  const sessions = createDrizzleSessionRepo(deps.db);
  const hasher = createArgon2Hasher();

  const authService = createAuthService({
    users,
    sessions,
    hasher,
    config: { sessionTtlDays: config.sessionTtlDays },
  });

  return createApp(config, {
    logError: deps.logError,
    auth: {
      service: authService,
      getClientAddress: defaultGetClientAddress,
    },
  });
}
