import type {
  AuthSuccessResponse,
  ProjectGetResponse,
  ProjectListResponse,
  ProjectSaveResponse,
  ProjectSummaryDto,
  ServerErrorDetail,
  ServerErrorResponse,
  UserDto,
  VersionDto,
  VersionGetResponse,
  VersionListResponse,
  VersionSummaryDto,
} from "./types.js";

export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function isUserDto(val: unknown): val is UserDto {
  if (!isRecord(val)) return false;
  return typeof val.id === "string" && typeof val.email === "string";
}

export function isAuthSuccessResponse(val: unknown): val is AuthSuccessResponse {
  if (!isRecord(val)) return false;
  return isUserDto(val.user);
}

export function isProjectSummaryDto(val: unknown): val is ProjectSummaryDto {
  if (!isRecord(val)) return false;
  return (
    typeof val.id === "string" &&
    typeof val.name === "string" &&
    typeof val.createdAt === "string" &&
    typeof val.updatedAt === "string" &&
    typeof val.latestVersion === "number" &&
    Number.isInteger(val.latestVersion)
  );
}

export function isProjectListResponse(val: unknown): val is ProjectListResponse {
  if (!isRecord(val)) return false;
  if (!Array.isArray(val.projects)) return false;
  return val.projects.every(isProjectSummaryDto);
}

export function isVersionDto(val: unknown): val is VersionDto {
  if (!isRecord(val)) return false;
  return (
    typeof val.versionNumber === "number" &&
    Number.isInteger(val.versionNumber) &&
    typeof val.schemaVersion === "number" &&
    Number.isInteger(val.schemaVersion) &&
    typeof val.createdAt === "string"
  );
}

export function isProjectSaveResponse(val: unknown): val is ProjectSaveResponse {
  if (!isRecord(val)) return false;
  return isProjectSummaryDto(val.project) && isVersionDto(val.version);
}

export function isProjectGetResponse(val: unknown): val is ProjectGetResponse {
  if (!isRecord(val)) return false;
  return (
    isProjectSummaryDto(val.project) &&
    isVersionDto(val.version) &&
    "document" in val &&
    val.document !== undefined &&
    val.document !== null
  );
}

export function isServerErrorDetail(val: unknown): val is ServerErrorDetail {
  if (!isRecord(val)) return false;
  return typeof val.path === "string" && typeof val.message === "string";
}

export function isServerErrorResponse(val: unknown): val is ServerErrorResponse {
  if (!isRecord(val)) return false;
  const error = val.error;
  if (!isRecord(error)) return false;
  if (typeof error.code !== "string" || typeof error.message !== "string") {
    return false;
  }
  if ("currentVersion" in error && error.currentVersion !== undefined) {
    if (typeof error.currentVersion !== "number" || !Number.isInteger(error.currentVersion)) {
      return false;
    }
  }
  if ("supported" in error && error.supported !== undefined) {
    if (typeof error.supported !== "number" || !Number.isInteger(error.supported)) {
      return false;
    }
  }
  if ("details" in error && error.details !== undefined) {
    if (!Array.isArray(error.details) || !error.details.every(isServerErrorDetail)) {
      return false;
    }
  }
  return true;
}

export function isVersionSummaryDto(val: unknown): val is VersionSummaryDto {
  if (!isRecord(val)) return false;
  return (
    typeof val.versionNumber === "number" &&
    Number.isInteger(val.versionNumber) &&
    typeof val.schemaVersion === "number" &&
    Number.isInteger(val.schemaVersion) &&
    typeof val.createdAt === "string" &&
    typeof val.createdByMe === "boolean"
  );
}

export function isVersionListResponse(val: unknown): val is VersionListResponse {
  if (!isRecord(val)) return false;
  return Array.isArray(val.versions) && val.versions.every(isVersionSummaryDto);
}

export function isVersionGetResponse(val: unknown): val is VersionGetResponse {
  if (!isRecord(val)) return false;
  return isVersionDto(val.version) && "document" in val;
}

