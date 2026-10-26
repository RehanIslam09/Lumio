import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VersionDiffView } from "./VersionDiffView.js";
import type { Project } from "@repo/schema";
import type { VersionSummaryDto } from "../api/types.js";
import { compareProjects } from "../lib/diff.js";

const projectA: Project = {
  id: "proj_1",
  name: "Story Chapter 1",
  nodes: [
    {
      id: "node_1",
      type: "start",
      title: "Start Scene",
      body: "Original prologue dialogue.",
      position: { x: 0, y: 0 },
    },
    {
      id: "node_2",
      type: "scene",
      title: "Old Scene",
      position: { x: 100, y: 0 },
    },
  ],
  edges: [
    { id: "edge_1", from: "node_1", to: "node_2" },
  ],
  variables: [],
  entities: [],
};

const projectB: Project = {
  id: "proj_1",
  name: "Story Chapter 1 (Revised)",
  nodes: [
    {
      id: "node_1",
      type: "start",
      title: "Start Scene",
      body: "Updated prologue dialogue with markdown **bold**.\nSecond line.",
      position: { x: 0, y: 0 },
    },
    // node_2 removed
    {
      id: "node_3",
      type: "end",
      title: "New Ending",
      position: { x: 200, y: 0 },
    },
  ],
  edges: [
    { id: "edge_2", from: "node_1", to: "node_3", condition: "hasKey == true" },
  ],
  variables: [
    { id: "var_1", name: "hasKey", type: "boolean", initial: false },
  ],
  entities: [
    { id: "char_1", kind: "character", name: "Hero" },
  ],
};

const sampleVersions: VersionSummaryDto[] = [
  { versionNumber: 2, schemaVersion: 2, createdAt: "2026-10-15T12:00:00Z", createdByMe: true },
  { versionNumber: 1, schemaVersion: 2, createdAt: "2026-10-14T10:00:00Z", createdByMe: true },
];

describe("VersionDiffView Component (W-039)", () => {
  it("renders comparison header, version selectors, and summary badges", () => {
    const diff = compareProjects(projectA, projectB);
    const element = React.createElement(VersionDiffView, {
      versionA: 1,
      versionB: 2,
      versionsList: sampleVersions,
      diff,
      onSelectVersions: vi.fn(),
      onBack: vi.fn(),
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain("Comparing v1 (Older) → v2 (Newer)");
    expect(html).toContain("Back to Version List");
    expect(html).toContain("Story Chapter 1 (Revised)");
    expect(html).toContain("New Ending");
    expect(html).toContain("hasKey");
  });

  it("displays line-by-line diff for changed markdown node body", () => {
    const diff = compareProjects(projectA, projectB);
    const element = React.createElement(VersionDiffView, {
      versionA: 1,
      versionB: 2,
      versionsList: sampleVersions,
      diff,
      onSelectVersions: vi.fn(),
      onBack: vi.fn(),
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain("Original prologue dialogue.");
    expect(html).toContain("Updated prologue dialogue with markdown **bold**.");
    expect(html).toContain("diff-line-removed");
    expect(html).toContain("diff-line-added");
  });

  it("renders friendly empty state when comparing identical versions", () => {
    const diff = compareProjects(projectA, projectA);
    const element = React.createElement(VersionDiffView, {
      versionA: 1,
      versionB: 1,
      versionsList: sampleVersions,
      diff,
      onSelectVersions: vi.fn(),
      onBack: vi.fn(),
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain("No differences found between v1 and v1");
    expect(html).toContain("The story documents are identical");
  });

  it("renders filter tabs with accessible attributes", () => {
    const diff = compareProjects(projectA, projectB);
    const element = React.createElement(VersionDiffView, {
      versionA: 1,
      versionB: 2,
      versionsList: sampleVersions,
      diff,
      onSelectVersions: vi.fn(),
      onBack: vi.fn(),
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain('role="tablist"');
    expect(html).toContain("All Changes");
    expect(html).toContain("Narrative Only");
    expect(html).toContain("Structure &amp; Layout");
  });
});
