import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Project } from "@repo/schema";
import { SimulationDialog, SimulationDialogContent } from "./SimulationDialog.js";

const sampleValidProject: Project = {
  id: "test-story",
  name: "Sample Journey",
  variables: [
    { id: "v1", name: "courage", type: "number", initial: 10 },
    { id: "v2", name: "hasKey", type: "boolean", initial: false },
  ],
  nodes: [
    { id: "s1", type: "start", title: "Gates of Adventure" },
    { id: "n1", type: "scene", title: "Crossroads Tavern" },
    { id: "e1", type: "end", title: "Glorious Victory" },
    { id: "orphan1", type: "scene", title: "Forgotten Crypt" },
  ],
  edges: [
    { id: "edge_1", from: "s1", to: "n1" },
    { id: "edge_2", from: "n1", to: "e1" },
  ],
};

const sampleNoStartProject: Project = {
  id: "test-no-start",
  name: "Graph Without Start",
  variables: [],
  nodes: [
    { id: "n1", type: "scene", title: "Floating Castle" },
  ],
  edges: [],
};

describe("SimulationDialog Component", () => {
  it("renders closed dialog when isOpen is false", () => {
    const html = renderToStaticMarkup(
      React.createElement(SimulationDialog, {
        isOpen: false,
        onClose: vi.fn(),
        onSelectTarget: vi.fn(),
        project: sampleValidProject,
      })
    );

    expect(html).toContain('class="sim-dialog"');
    expect(html).not.toContain("Story Simulation &amp; Path Coverage");
  });

  it("renders full simulation workspace when isOpen is true", () => {
    const html = renderToStaticMarkup(
      React.createElement(SimulationDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSelectTarget: vi.fn(),
        project: sampleValidProject,
      })
    );

    expect(html).toContain("Story Simulation &amp; Path Coverage");
    expect(html).toContain("Analytics Engine");
    expect(html).toContain("Automated virtual playtesting to verify branch reachability");
    expect(html).toContain("How It Works");
    expect(html).toContain("Virtual Readers (Runs)");
    expect(html).toContain("Max Steps Per Run");
    expect(html).toContain("Random Seed");
    expect(html).toContain("Run Simulation");
  });

  it("renders outcome distribution bar and summary stat cards", () => {
    const html = renderToStaticMarkup(
      React.createElement(SimulationDialogContent, {
        project: sampleValidProject,
        onClose: vi.fn(),
        onSelectTarget: vi.fn(),
      })
    );

    // Distribution progress bar
    expect(html).toContain('class="sim-distribution-card"');
    expect(html).toContain("Playthrough Outcomes Distribution");
    expect(html).toContain("sim-dist-segment");

    // Metric stat cards
    expect(html).toContain("Total Runs");
    expect(html).toContain("Reached End");
    expect(html).toContain("Stuck at Scene");
    expect(html).toContain("Step Limit");
    expect(html).toContain("Never Visited");
    expect(html).toContain("Longest Run");

    // Endings section
    expect(html).toContain("Story Endings Reached");
    expect(html).toContain("Glorious Victory");

    // Cross-check findings section
    expect(html).toContain("Reachability &amp; Graph Findings");
  });

  it("displays error banner when project lacks a Start node", () => {
    const html = renderToStaticMarkup(
      React.createElement(SimulationDialogContent, {
        project: sampleNoStartProject,
        onClose: vi.fn(),
        onSelectTarget: vi.fn(),
      })
    );

    expect(html).toContain("sim-error-banner");
    expect(html).toContain("Cannot run simulation:");
    expect(html).toContain("Project has no Start node");
  });

  it("renders interactive presets and canvas jump buttons for orphans", () => {
    const html = renderToStaticMarkup(
      React.createElement(SimulationDialogContent, {
        project: sampleValidProject,
        onClose: vi.fn(),
        onSelectTarget: vi.fn(),
      })
    );

    // Presets
    expect(html).toContain("Quick Check");
    expect(html).toContain("Standard QA");
    expect(html).toContain("Deep Analysis");

    // Action button to jump to orphan scene on canvas
    expect(html).toContain("Show on canvas");
    expect(html).toContain("Forgotten Crypt");
  });
});
