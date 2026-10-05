import type { Project } from "@repo/schema";
import type { RateLimiter } from "../auth/rateLimiter.js";
import type {
  ProjectRepo,
  PublicProject,
  PublicVersionDetail,
  PublicVersionSummary,
} from "./repositories.js";
import {
  validateProjectInput,
  type ValidationErrorDetail,
} from "./validate.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_INT32 = 2_147_483_647;
export const DEFAULT_MAX_PROJECTS_PER_USER = 200;

export interface ProjectServiceLimits {
  maxProjectsPerUser: number;
}

export interface ProjectServiceDependencies {
  projects: ProjectRepo;
  clock?: () => Date;
  limiter: RateLimiter;
  limits?: Partial<ProjectServiceLimits>;
}

export type ProjectServiceResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: "invalid-request";
      details: ValidationErrorDetail[];
      message?: string;
    }
  | {
      ok: false;
      code: "unsupported-schema-version";
      supported: number;
      details: ValidationErrorDetail[];
      message?: string;
    }
  | {
      ok: false;
      code: "not-found";
      message?: string;
    }
  | {
      ok: false;
      code: "version-conflict";
      currentVersion: number;
      message?: string;
    }
  | {
      ok: false;
      code: "project-limit-reached";
      message?: string;
    }
  | {
      ok: false;
      code: "rate-limited";
      retryAfterSeconds: number;
      message?: string;
    };

export interface ProjectService {
  list(ownerId: string): Promise<ProjectServiceResult<{ projects: PublicProject[] }>>;

  create(
    ownerId: string,
    raw: unknown,
  ): Promise<ProjectServiceResult<{ project: PublicProject; version: PublicVersionDetail }>>;

  get(params: {
    id: string;
    ownerId: string;
  }): Promise<
    ProjectServiceResult<{
      project: PublicProject;
      version: PublicVersionDetail;
      document: Project;
    }>
  >;

  save(params: {
    id: string;
    ownerId: string;
    raw: unknown;
  }): Promise<ProjectServiceResult<{ project: PublicProject; version: PublicVersionDetail }>>;

  listVersions(params: {
    id: string;
    ownerId: string;
  }): Promise<ProjectServiceResult<{ versions: PublicVersionSummary[] }>>;

  getVersion(params: {
    id: string;
    ownerId: string;
    versionNumber: number;
  }): Promise<ProjectServiceResult<{ version: PublicVersionDetail; document: Project }>>;

  delete(params: {
    id: string;
    ownerId: string;
  }): Promise<ProjectServiceResult<void>>;
}

export function createProjectService(deps: ProjectServiceDependencies): ProjectService {
  const {
    projects,
    clock = () => new Date(),
    limiter,
    limits = {},
  } = deps;

  const maxProjectsPerUser = limits.maxProjectsPerUser ?? DEFAULT_MAX_PROJECTS_PER_USER;

  function checkWriteRateLimit(ownerId: string):
    | { allowed: true }
    | { allowed: false; retryAfterSeconds: number } {
    const res = limiter.check(ownerId);
    limiter.record(ownerId);
    return res;
  }

  function isValidUuid(id: string): boolean {
    return UUID_REGEX.test(id);
  }

  return {
    async list(ownerId: string) {
      const list = await projects.listForOwner(ownerId, 200);
      return { ok: true, data: { projects: list } };
    },

    async create(ownerId: string, raw: unknown) {
      const rateCheck = checkWriteRateLimit(ownerId);
      if (!rateCheck.allowed) {
        return {
          ok: false,
          code: "rate-limited",
          retryAfterSeconds: rateCheck.retryAfterSeconds,
          message: "Too many requests",
        };
      }

      const validation = validateProjectInput(raw, { requireBaseVersion: false });
      if (!validation.ok) {
        if (validation.code === "unsupported-schema-version") {
          return {
            ok: false,
            code: "unsupported-schema-version",
            supported: validation.supported ?? 1,
            details: validation.details,
            message: "Unsupported schema version",
          };
        }
        return {
          ok: false,
          code: "invalid-request",
          details: validation.details,
          message: "Invalid project payload",
        };
      }

      const res = await projects.createWithFirstVersion({
        ownerId,
        document: validation.value.document,
        schemaVersion: validation.value.schemaVersion,
        maxProjectsPerUser,
        now: clock(),
      });

      if (!res.ok) {
        return {
          ok: false,
          code: "project-limit-reached",
          message: `Project limit reached (maximum ${maxProjectsPerUser} projects allowed)`,
        };
      }

      return {
        ok: true,
        data: {
          project: res.project,
          version: res.version,
        },
      };
    },

    async get(params: { id: string; ownerId: string }) {
      if (!isValidUuid(params.id)) {
        return { ok: false, code: "not-found", message: "Not found" };
      }

      const res = await projects.getLatest({ id: params.id, ownerId: params.ownerId });
      if (!res.ok) {
        return { ok: false, code: "not-found", message: "Not found" };
      }

      return {
        ok: true,
        data: {
          project: res.project,
          version: res.version,
          document: res.document,
        },
      };
    },

    async save(params: { id: string; ownerId: string; raw: unknown }) {
      const rateCheck = checkWriteRateLimit(params.ownerId);
      if (!rateCheck.allowed) {
        return {
          ok: false,
          code: "rate-limited",
          retryAfterSeconds: rateCheck.retryAfterSeconds,
          message: "Too many requests",
        };
      }

      if (!isValidUuid(params.id)) {
        return { ok: false, code: "not-found", message: "Not found" };
      }

      const validation = validateProjectInput(params.raw, { requireBaseVersion: true });
      if (!validation.ok) {
        if (validation.code === "unsupported-schema-version") {
          return {
            ok: false,
            code: "unsupported-schema-version",
            supported: validation.supported ?? 1,
            details: validation.details,
            message: "Unsupported schema version",
          };
        }
        return {
          ok: false,
          code: "invalid-request",
          details: validation.details,
          message: "Invalid project payload",
        };
      }

      const res = await projects.saveNewVersion({
        id: params.id,
        ownerId: params.ownerId,
        baseVersion: validation.value.baseVersion ?? 0,
        schemaVersion: validation.value.schemaVersion,
        document: validation.value.document,
        now: clock(),
      });

      if (!res.ok) {
        if (res.code === "not-found") {
          return { ok: false, code: "not-found", message: "Not found" };
        }
        return {
          ok: false,
          code: "version-conflict",
          currentVersion: res.currentVersion,
          message: `Version conflict: base version does not match current version ${res.currentVersion}`,
        };
      }

      return {
        ok: true,
        data: {
          project: res.project,
          version: res.version,
        },
      };
    },

    async listVersions(params: { id: string; ownerId: string }) {
      if (!isValidUuid(params.id)) {
        return { ok: false, code: "not-found", message: "Not found" };
      }

      const res = await projects.listVersions({ id: params.id, ownerId: params.ownerId, limit: 200 });
      if (!res.ok) {
        return { ok: false, code: "not-found", message: "Not found" };
      }

      return {
        ok: true,
        data: {
          versions: res.versions,
        },
      };
    },

    async getVersion(params: { id: string; ownerId: string; versionNumber: number }) {
      if (!isValidUuid(params.id)) {
        return { ok: false, code: "not-found", message: "Not found" };
      }

      if (
        !Number.isInteger(params.versionNumber) ||
        params.versionNumber < 1 ||
        params.versionNumber > MAX_INT32
      ) {
        return { ok: false, code: "not-found", message: "Not found" };
      }

      const res = await projects.getVersion({
        id: params.id,
        ownerId: params.ownerId,
        versionNumber: params.versionNumber,
      });

      if (!res.ok) {
        return { ok: false, code: "not-found", message: "Not found" };
      }

      return {
        ok: true,
        data: {
          version: res.version,
          document: res.document,
        },
      };
    },

    async delete(params: { id: string; ownerId: string }) {
      const rateCheck = checkWriteRateLimit(params.ownerId);
      if (!rateCheck.allowed) {
        return {
          ok: false,
          code: "rate-limited",
          retryAfterSeconds: rateCheck.retryAfterSeconds,
          message: "Too many requests",
        };
      }

      if (!isValidUuid(params.id)) {
        return { ok: false, code: "not-found", message: "Not found" };
      }

      const res = await projects.deleteOwned({ id: params.id, ownerId: params.ownerId });
      if (!res.ok) {
        return { ok: false, code: "not-found", message: "Not found" };
      }

      return { ok: true, data: undefined };
    },
  };
}
