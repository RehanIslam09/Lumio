import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DeleteStoryDialog } from "./DeleteStoryDialog.js";
import type { ProjectSummaryDto } from "../../api/types.js";

const mockProject: ProjectSummaryDto = {
  id: "story-test-1",
  name: "The Forgotten Citadel",
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-10T12:00:00.000Z",
  latestVersion: 1,
};

describe("DeleteStoryDialog Component & Bug Fix (A4)", () => {
  it("renders with unblocked confirmation button initially", () => {
    const html = renderToStaticMarkup(
      React.createElement(DeleteStoryDialog, {
        isOpen: true,
        project: mockProject,
        onClose: vi.fn(),
        onConfirmDelete: vi.fn().mockResolvedValue({ ok: true }),
      }),
    );

    expect(html).toContain("The Forgotten Citadel");
    expect(html).toContain("Delete Story");
    expect(html).not.toContain("Deleting Story…");
  });
});
