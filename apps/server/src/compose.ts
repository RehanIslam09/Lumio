import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Hono } from "hono";
import { createApp } from "./app.js";
import { createDrizzleSessionRepo, createDrizzleUserRepo } from "./auth/drizzleRepos.js";
import { createArgon2Hasher } from "./auth/passwordHasher.js";
import { createRateLimiter } from "./auth/rateLimiter.js";
import { defaultGetClientAddress } from "./auth/routes.js";
import { createAuthService } from "./auth/service.js";
import type { Config } from "./config.js";
import { createDrizzleProjectRepo } from "./projects/drizzleProjectRepo.js";
import { createProjectService } from "./projects/service.js";

export interface ComposeAppDependencies {
  db: NodePgDatabase;
  logError: (err: unknown) => void;
  projectLimits?: {
    maxProjectsPerUser?: number;
  };
  projectRateLimit?: {
    max: number;
    windowMs: number;
  };
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

  const projectRepo = createDrizzleProjectRepo(deps.db);
  const projectLimiter = createRateLimiter({
    max: deps.projectRateLimit?.max ?? 60,
    windowMs: deps.projectRateLimit?.windowMs ?? 60_000,
  });
  const projectService = createProjectService({
    projects: projectRepo,
    limiter: projectLimiter,
    limits: deps.projectLimits,
  });

  return createApp(config, {
    logError: deps.logError,
    auth: {
      service: authService,
      getClientAddress: defaultGetClientAddress,
    },
    projects: {
      service: projectService,
    },
  });
}
