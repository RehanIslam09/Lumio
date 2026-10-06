import { describe, expect, it } from "vitest";
import {
  isAuthSuccessResponse,
  isProjectListResponse,
  isProjectSaveResponse,
  isProjectGetResponse,
  isServerErrorResponse,
  isUserDto,
  isVersionSummaryDto,
  isVersionListResponse,
  isVersionGetResponse,
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

  describe("isVersionSummaryDto", () => {
    const validSummary = {
      versionNumber: 2,
      schemaVersion: 1,
      createdAt: "2026-10-06T10:00:00.000Z",
      createdByMe: true,
    };

    it("accepts valid version summary and allows extra keys", () => {
      expect(isVersionSummaryDto(validSummary)).toBe(true);
      expect(isVersionSummaryDto({ ...validSummary, createdByMe: false })).toBe(true);
      expect(isVersionSummaryDto({ ...validSummary, extraProp: "ignored" })).toBe(true);
    });

    it("rejects non-objects, null, undefined, arrays", () => {
      expect(isVersionSummaryDto(null)).toBe(false);
      expect(isVersionSummaryDto(undefined)).toBe(false);
      expect(isVersionSummaryDto(42)).toBe(false);
      expect(isVersionSummaryDto("string")).toBe(false);
      expect(isVersionSummaryDto([])).toBe(false);
      expect(isVersionSummaryDto({})).toBe(false);
    });

    it("rejects missing fields", () => {
      expect(
        isVersionSummaryDto({
          schemaVersion: 1,
          createdAt: "2026-10-06T10:00:00.000Z",
          createdByMe: true,
        }),
      ).toBe(false);
      expect(
        isVersionSummaryDto({
          versionNumber: 2,
          createdAt: "2026-10-06T10:00:00.000Z",
          createdByMe: true,
        }),
      ).toBe(false);
      expect(
        isVersionSummaryDto({
          versionNumber: 2,
          schemaVersion: 1,
          createdByMe: true,
        }),
      ).toBe(false);
      expect(
        isVersionSummaryDto({
          versionNumber: 2,
          schemaVersion: 1,
          createdAt: "2026-10-06T10:00:00.000Z",
        }),
      ).toBe(false);
    });

    it("rejects wrong types, including createdByMe not a real boolean", () => {
      expect(isVersionSummaryDto({ ...validSummary, versionNumber: "2" })).toBe(false);
      expect(isVersionSummaryDto({ ...validSummary, schemaVersion: "1" })).toBe(false);
      expect(isVersionSummaryDto({ ...validSummary, createdAt: 123456 })).toBe(false);
      expect(isVersionSummaryDto({ ...validSummary, createdByMe: "true" })).toBe(false);
      expect(isVersionSummaryDto({ ...validSummary, createdByMe: 1 })).toBe(false);
      expect(isVersionSummaryDto({ ...validSummary, createdByMe: null })).toBe(false);
      expect(isVersionSummaryDto({ ...validSummary, createdByMe: undefined })).toBe(false);
    });
  });

  describe("isVersionListResponse", () => {
    const validSummary = {
      versionNumber: 1,
      schemaVersion: 1,
      createdAt: "2026-10-06T10:00:00.000Z",
      createdByMe: true,
    };

    it("accepts empty and populated versions arrays, allows extra keys", () => {
      expect(isVersionListResponse({ versions: [] })).toBe(true);
      expect(isVersionListResponse({ versions: [validSummary] })).toBe(true);
      expect(isVersionListResponse({ versions: [validSummary], extra: 123 })).toBe(true);
    });

    it("rejects non-objects, null, undefined, wrong types, missing versions", () => {
      expect(isVersionListResponse(null)).toBe(false);
      expect(isVersionListResponse(undefined)).toBe(false);
      expect(isVersionListResponse([])).toBe(false);
      expect(isVersionListResponse({})).toBe(false);
      expect(isVersionListResponse({ versions: "not-an-array" })).toBe(false);
      expect(isVersionListResponse({ versions: null })).toBe(false);
      expect(isVersionListResponse({ versions: [{ versionNumber: 1 }] })).toBe(false);
    });
  });

  describe("isVersionGetResponse", () => {
    const validEnvelope = {
      version: sampleVersion,
      document: { anyDocumentField: true },
    };

    it("accepts valid envelope and verifies envelope-only check for document", () => {
      expect(isVersionGetResponse(validEnvelope)).toBe(true);
      expect(isVersionGetResponse({ version: sampleVersion, document: null })).toBe(true);
      expect(isVersionGetResponse({ version: sampleVersion, document: "raw-string" })).toBe(true);
      expect(isVersionGetResponse({ version: sampleVersion, document: {}, extra: true })).toBe(true);
    });

    it("rejects non-objects, null, missing version, invalid version, or missing document", () => {
      expect(isVersionGetResponse(null)).toBe(false);
      expect(isVersionGetResponse(undefined)).toBe(false);
      expect(isVersionGetResponse([])).toBe(false);
      expect(isVersionGetResponse({})).toBe(false);
      expect(isVersionGetResponse({ version: sampleVersion })).toBe(false);
      expect(isVersionGetResponse({ document: {} })).toBe(false);
      expect(isVersionGetResponse({ version: { versionNumber: "bad" }, document: {} })).toBe(false);
    });
  });
});

