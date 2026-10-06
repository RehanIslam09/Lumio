import type { Project } from "@repo/schema";
import {
  isAuthSuccessResponse,
  isProjectGetResponse,
  isProjectListResponse,
  isProjectSaveResponse,
  isServerErrorResponse,
  isVersionGetResponse,
  isVersionListResponse,
} from "./guards.js";
import type {
  ApiResult,
  AuthSuccessResponse,
  ProjectGetResponse,
  ProjectListResponse,
  ProjectSaveResponse,
  ServerErrorDetail,
  VersionGetResponse,
  VersionListResponse,
} from "./types.js";

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

const ERROR_CODE_MESSAGES: Record<string, string> = {
  "invalid-request": "Invalid request data",
  unauthenticated: "Authentication required",
  "invalid-credentials": "Invalid email or password",
  csrf: "Security verification failed (CSRF)",
  "email-taken": "Email is already registered",
  "not-found": "Requested resource was not found",
  "version-conflict": "Version conflict: the cloud project has been updated",
  "project-limit-reached": "Project limit reached",
  "payload-too-large": "Request payload exceeds allowed limit",
  "document-too-large": "Document exceeds maximum allowed size",
  "unsupported-media-type": "Unsupported media type",
  "unsupported-schema-version": "Unsupported schema version",
  "rate-limited": "Too many requests; please slow down",
  internal: "Internal server error",
};

function getFixedErrorMessage(code: string | undefined): string {
  if (!code) return "Server error occurred";
  return ERROR_CODE_MESSAGES[code] ?? `Request failed (${code})`;
}

function parseRetryAfter(headerValue: string | null | undefined): number | undefined {
  if (!headerValue) return undefined;
  const parsed = Number(headerValue.trim());
  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }
  return undefined;
}

export function createApiClient(options: ApiClientOptions) {
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 30_000;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  async function request<T>(params: {
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    guard?: (data: unknown) => data is T;
  }): Promise<ApiResult<T>> {
    const url = `${baseUrl}/${params.path.replace(/^\/+/, "")}`;
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
    }

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      if (params.body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      let response: Response;
      try {
        response = await fetchFn(url, {
          method: params.method,
          credentials: "include",
          headers,
          body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
          signal: controller.signal,
        });
      } catch (err: unknown) {
        if (
          (err instanceof Error && err.name === "AbortError") ||
          controller.signal.aborted
        ) {
          return {
            ok: false,
            kind: "timeout",
            message: "Request timed out",
          };
        }
        return {
          ok: false,
          kind: "network",
          message: "Network error: unable to reach the server",
        };
      }

      const status = response.status;
      const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));

      // 204 No Content
      if (status === 204) {
        return {
          ok: true,
          status,
          data: undefined as unknown as T,
        };
      }

      // Read response body as text first to handle empty/non-JSON safely
      const text = await response.text();
      let parsedBody: unknown;
      let isJson = false;

      if (text.trim().length > 0) {
        try {
          parsedBody = JSON.parse(text);
          isJson = true;
        } catch {
          isJson = false;
        }
      }

      // Handle non-2xx responses
      if (status < 200 || status >= 300) {
        if (isJson && isServerErrorResponse(parsedBody)) {
          const err = parsedBody.error;
          const details: ServerErrorDetail[] | undefined = err.details
            ? err.details.slice(0, 10).map((d) => ({
                path: String(d.path),
                message: String(d.message),
              }))
            : undefined;

          return {
            ok: false,
            kind: "http",
            status,
            code: err.code,
            message: getFixedErrorMessage(err.code),
            details,
            currentVersion: err.currentVersion,
            supported: err.supported,
            retryAfterSeconds,
          };
        }

        // Generic HTTP error without server error envelope
        return {
          ok: false,
          kind: "http",
          status,
          message: `Request failed with HTTP status ${status}`,
          retryAfterSeconds,
        };
      }

      // 2xx response handling
      if (!isJson) {
        return {
          ok: false,
          kind: "malformed",
          status,
          message: "Server returned non-JSON response",
        };
      }

      if (params.guard) {
        if (!params.guard(parsedBody)) {
          return {
            ok: false,
            kind: "malformed",
            status,
            message: "Server returned unexpected response structure",
          };
        }
        return {
          ok: true,
          status,
          data: parsedBody,
        };
      }

      return {
        ok: true,
        status,
        data: parsedBody as T,
      };
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  return {
    async register(body: { email: string; password: string }): Promise<ApiResult<AuthSuccessResponse>> {
      return request({
        path: "api/auth/register",
        method: "POST",
        body,
        guard: isAuthSuccessResponse,
      });
    },

    async login(body: { email: string; password: string }): Promise<ApiResult<AuthSuccessResponse>> {
      return request({
        path: "api/auth/login",
        method: "POST",
        body,
        guard: isAuthSuccessResponse,
      });
    },

    async logout(): Promise<ApiResult<void>> {
      return request({
        path: "api/auth/logout",
        method: "POST",
      });
    },

    async me(): Promise<ApiResult<AuthSuccessResponse>> {
      return request({
        path: "api/auth/me",
        method: "GET",
        guard: isAuthSuccessResponse,
      });
    },

    async listProjects(): Promise<ApiResult<ProjectListResponse>> {
      return request({
        path: "api/projects",
        method: "GET",
        guard: isProjectListResponse,
      });
    },

    async createProject(body: {
      schemaVersion: number;
      document: Project;
    }): Promise<ApiResult<ProjectSaveResponse>> {
      return request({
        path: "api/projects",
        method: "POST",
        body,
        guard: isProjectSaveResponse,
      });
    },

    async getProject(id: string): Promise<ApiResult<ProjectGetResponse>> {
      return request({
        path: `api/projects/${encodeURIComponent(id)}`,
        method: "GET",
        guard: isProjectGetResponse,
      });
    },

    async saveProject(
      id: string,
      body: { baseVersion: number; schemaVersion: number; document: Project },
    ): Promise<ApiResult<ProjectSaveResponse>> {
      return request({
        path: `api/projects/${encodeURIComponent(id)}`,
        method: "PUT",
        body,
        guard: isProjectSaveResponse,
      });
    },

    async deleteProject(id: string): Promise<ApiResult<void>> {
      return request({
        path: `api/projects/${encodeURIComponent(id)}`,
        method: "DELETE",
      });
    },

    async listVersions(projectId: string): Promise<ApiResult<VersionListResponse>> {
      return request({
        path: `api/projects/${encodeURIComponent(projectId)}/versions`,
        method: "GET",
        guard: isVersionListResponse,
      });
    },

    async getVersion(
      projectId: string,
      versionNumber: number,
    ): Promise<ApiResult<VersionGetResponse>> {
      if (!Number.isInteger(versionNumber) || versionNumber < 1) {
        return {
          ok: false,
          kind: "malformed",
          message: "Invalid version number",
        };
      }
      return request({
        path: `api/projects/${encodeURIComponent(projectId)}/versions/${versionNumber}`,
        method: "GET",
        guard: isVersionGetResponse,
      });
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
