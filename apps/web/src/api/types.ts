export interface UserDto {
  id: string;
  email: string;
}

export interface AuthSuccessResponse {
  user: UserDto;
}

export interface ProjectSummaryDto {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  latestVersion: number;
}

export interface ProjectListResponse {
  projects: ProjectSummaryDto[];
}

export interface VersionDto {
  versionNumber: number;
  schemaVersion: number;
  createdAt: string;
}

/**
 * Server POST /api/projects and PUT /api/projects/:id return { project, version }
 * WITHOUT document.
 */
export interface ProjectSaveResponse {
  project: ProjectSummaryDto;
  version: VersionDto;
}

/**
 * Server GET /api/projects/:id returns { project, version, document }.
 * document is typed as unknown here; it is validated later via validateProjectDocument.
 */
export interface ProjectGetResponse {
  project: ProjectSummaryDto;
  version: VersionDto;
  document: unknown;
}

export interface ServerErrorDetail {
  path: string;
  message: string;
}

export interface ServerErrorResponse {
  error: {
    code: string;
    message: string;
    details?: ServerErrorDetail[];
    currentVersion?: number;
    supported?: number;
  };
}

export type ApiResult<T> =
  | {
      ok: true;
      status: number;
      data: T;
    }
  | {
      ok: false;
      kind: "network" | "timeout" | "http" | "malformed";
      status?: number;
      code?: string;
      message: string;
      details?: ServerErrorDetail[];
      currentVersion?: number;
      supported?: number;
      retryAfterSeconds?: number;
    };
