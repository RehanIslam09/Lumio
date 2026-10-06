import { describe, expect, it } from "vitest";
import {
  isAuthSuccessResponse,
  isProjectListResponse,
  isProjectSaveResponse,
  isProjectGetResponse,
  isServerErrorResponse,
  isUserDto,
} from "./guards.js";

describe("api runtime guards", () => {
  const sampleUser = { id: "u-123", email: "user@example.com" };
  const sampleSummary = {
    id: "p-456",
    name: "My Story",
    createdAt: "2026-10-05T00:00:00.000Z",
    updatedAt: "2026-10-05T00:00:00.000Z",
    latestVersion: 1,
  };
  const sampleVersion = {
    versionNumber: 1,
    schemaVersion: 1,
    createdAt: "2026-10-05T00:00:00.000Z",
  };

  describe("isUserDto & isAuthSuccessResponse", () => {
    it("accepts valid shapes", () => {
      expect(isUserDto(sampleUser)).toBe(true);
      expect(isAuthSuccessResponse({ user: sampleUser })).toBe(true);
      // allows extra keys
      expect(isAuthSuccessResponse({ user: { ...sampleUser, extra: true }, meta: "test" })).toBe(true);
    });

    it("rejects wrong types, null, undefined, arrays, missing fields", () => {
      const invalids = [
        null,
        undefined,
        42,
        "string",
        [],
        {},
        { user: null },
        { user: {} },
        { user: { id: "1" } }, // missing email
        { user: { email: "a@b.com" } }, // missing id
        { user: { id: 1, email: "a@b.com" } }, // wrong id type
        { user: { id: "1", email: 123 } }, // wrong email type
      ];
      for (const inv of invalids) {
        expect(isAuthSuccessResponse(inv)).toBe(false);
      }
    });

    it("never throws on hostile inputs", () => {
      expect(() => isAuthSuccessResponse(Object.create(null))).not.toThrow();
      expect(() => isUserDto(Object.create(null))).not.toThrow();
    });
  });

  describe("isProjectListResponse", () => {
    it("accepts valid empty or populated list", () => {
      expect(isProjectListResponse({ projects: [] })).toBe(true);
      expect(isProjectListResponse({ projects: [sampleSummary] })).toBe(true);
    });

    it("rejects invalid project list entries or non-objects", () => {
      expect(isProjectListResponse(null)).toBe(false);
      expect(isProjectListResponse({ projects: "not-an-array" })).toBe(false);
      expect(isProjectListResponse({ projects: [{ id: "1" }] })).toBe(false);
    });
  });

  describe("isProjectSaveResponse", () => {
    it("accepts valid save response containing project and version", () => {
      expect(
        isProjectSaveResponse({
          project: sampleSummary,
          version: sampleVersion,
        }),
      ).toBe(true);
    });

    it("does NOT require document for save/create", () => {
      expect(
        isProjectSaveResponse({
          project: sampleSummary,
          version: sampleVersion,
        }),
      ).toBe(true);
    });

    it("rejects missing version or project", () => {
      expect(isProjectSaveResponse({ project: sampleSummary })).toBe(false);
      expect(isProjectSaveResponse({ version: sampleVersion })).toBe(false);
    });
  });

  describe("isProjectGetResponse", () => {
    it("requires project, version, and document", () => {
      expect(
        isProjectGetResponse({
          project: sampleSummary,
          version: sampleVersion,
          document: { id: "doc-1", name: "Doc" },
        }),
      ).toBe(true);
    });

    it("rejects missing document", () => {
      expect(
        isProjectGetResponse({
          project: sampleSummary,
          version: sampleVersion,
        }),
      ).toBe(false);
    });
  });

  describe("isServerErrorResponse", () => {
    it("accepts standard error shape", () => {
      expect(
        isServerErrorResponse({
          error: {
            code: "invalid-request",
            message: "Bad request",
          },
        }),
      ).toBe(true);
    });

    it("accepts optional currentVersion, supported, details", () => {
      expect(
        isServerErrorResponse({
          error: {
            code: "version-conflict",
            message: "Conflict",
            currentVersion: 3,
          },
        }),
      ).toBe(true);

      expect(
        isServerErrorResponse({
          error: {
            code: "unsupported-schema-version",
            message: "Unsupported",
            supported: 1,
            details: [{ path: "body", message: "invalid" }],
          },
        }),
      ).toBe(true);
    });

    it("rejects invalid error responses", () => {
      expect(isServerErrorResponse(null)).toBe(false);
      expect(isServerErrorResponse({})).toBe(false);
      expect(isServerErrorResponse({ error: null })).toBe(false);
      expect(isServerErrorResponse({ error: { code: 123 } })).toBe(false);
      expect(isServerErrorResponse({ error: { message: "msg" } })).toBe(false);
    });
  });
});
