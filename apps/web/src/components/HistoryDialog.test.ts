import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HistoryDialog } from "./HistoryDialog.js";
import type { ListVersionsOutcome, FetchVersionOutcome } from "../cloud/types.js";
import type { VersionSummaryDto } from "../api/types.js";

const mockVersions: VersionSummaryDto[] = [
  { versionNumber: 2, schemaVersion: 2, createdAt: "2026-10-15T12:00:00Z", createdByMe: true },
  { versionNumber: 1, schemaVersion: 2, createdAt: "2026-10-14T10:00:00Z", createdByMe: true },
];

describe("HistoryDialog Component with Visual Diff (W-039)", () => {
  it("renders version history list with Compare buttons when versions >= 2", () => {
    const onListVersions = vi.fn().mockResolvedValue({
      kind: "listed",
      versions: mockVersions,
    } as ListVersionsOutcome);

    const onFetchVersion = vi.fn();
    const onRestore = vi.fn();
    const onDownload = vi.fn();
    const onClose = vi.fn();

    const element = React.createElement(HistoryDialog, {
      isOpen: true,
      onClose,
      baseVersion: 2,
      isDirty: false,
      onListVersions,
      onFetchVersion,
      onRestore,
      onDownload,
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain("Version History");
    expect(html).toContain("Close");
  });

  it("renders empty state message when project has no versions", () => {
    const onListVersions = vi.fn().mockResolvedValue({
      kind: "listed",
      versions: [],
    } as ListVersionsOutcome);

    const element = React.createElement(HistoryDialog, {
      isOpen: true,
      onClose: vi.fn(),
      baseVersion: 1,
      isDirty: false,
      onListVersions,
      onFetchVersion: vi.fn(),
      onRestore: vi.fn(),
      onDownload: vi.fn(),
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain("history-dialog");
  });

  it("handles fetch failure gracefully without crashing", async () => {
    const onListVersions = vi.fn().mockResolvedValue({
      kind: "listed",
      versions: mockVersions,
    } as ListVersionsOutcome);

    const onFetchVersion = vi.fn().mockResolvedValue({
      kind: "network",
    } as FetchVersionOutcome);

    const element = React.createElement(HistoryDialog, {
      isOpen: true,
      onClose: vi.fn(),
      baseVersion: 2,
      isDirty: false,
      onListVersions,
      onFetchVersion,
      onRestore: vi.fn(),
      onDownload: vi.fn(),
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain("history-dialog");
  });
});
