import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoryThumbnailView } from "./StoryThumbnailView.js";
import type { PreviewLoader, ThumbnailLoadState } from "./storyThumbnailLoader.js";
import type { StoryThumbnailData } from "./storyThumbnail.js";

function createMockLoader(state: ThumbnailLoadState): PreviewLoader {
  return {
    subscribe: (_id, _v, listener) => {
      listener(state);
      return () => {};
    },
    get: () => state,
    retry: (_id, _v, listener) => {
      listener(state);
      return () => {};
    },
    clear: () => {},
  };
}

describe("StoryThumbnailView component (B, C, D, A8)", () => {
  it("renders loading skeleton shimmer when state is loading", () => {
    const loader = createMockLoader({ status: "loading" });
    const html = renderToStaticMarkup(
      React.createElement(StoryThumbnailView, {
        projectId: "p1",
        latestVersion: 1,
        loader,
        variant: "card",
      }),
    );
    expect(html).toContain("dash-thumb-skeleton");
    expect(html).toContain("Loading graph…");
  });

  it("renders error state with retry button when state is error", () => {
    const loader = createMockLoader({ status: "error", message: "Failed" });
    const html = renderToStaticMarkup(
      React.createElement(StoryThumbnailView, {
        projectId: "p1",
        latestVersion: 1,
        loader,
        variant: "card",
      }),
    );
    expect(html).toContain("Preview unavailable");
    expect(html).toContain("dash-thumb-retry-btn");
    expect(html).toContain("Retry");
  });

  it("renders empty state when story has zero nodes", () => {
    const emptyData: StoryThumbnailData = {
      width: 320,
      height: 180,
      nodes: [],
      edges: [],
      stats: {
        nodeCount: 0,
        edgeCount: 0,
        startCount: 0,
        endCount: 0,
        sampled: false,
        shownNodes: 0,
        shownEdges: 0,
      },
    };
    const loader = createMockLoader({ status: "ready", data: emptyData });
    const html = renderToStaticMarkup(
      React.createElement(StoryThumbnailView, {
        projectId: "p1",
        latestVersion: 1,
        loader,
        variant: "card",
      }),
    );
    expect(html).toContain("No scenes yet");
  });

  it("renders real SVG graph with nodes, bucketed edges, and exact stats line", () => {
    const data: StoryThumbnailData = {
      width: 320,
      height: 180,
      nodes: [
        { id: "start", x: 20, y: 90, kind: "start", weight: 1 },
        { id: "scene", x: 160, y: 90, kind: "scene", weight: 1 },
        { id: "end", x: 300, y: 90, kind: "end", weight: 1 },
      ],
      edges: [
        { from: "start", to: "scene", weight: 1 },
        { from: "scene", to: "end", weight: 1 },
      ],
      stats: {
        nodeCount: 3,
        edgeCount: 2,
        startCount: 1,
        endCount: 1,
        sampled: false,
        shownNodes: 3,
        shownEdges: 2,
      },
    };
    const loader = createMockLoader({ status: "ready", data: data });
    const html = renderToStaticMarkup(
      React.createElement(StoryThumbnailView, {
        projectId: "p1",
        latestVersion: 1,
        loader,
        variant: "card",
      }),
    );

    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("3 nodes · 2 edges · 1 ending");
    // Emerald start node (#10b981)
    expect(html).toContain('fill="#10b981"');
    // Violet end node (#a855f7)
    expect(html).toContain('fill="#a855f7"');
    // Muted indigo scene node (#6366f1)
    expect(html).toContain('fill="#6366f1"');
  });

  it("renders sampled overview label and tooltip when graph is sampled", () => {
    const sampledData: StoryThumbnailData = {
      width: 320,
      height: 180,
      nodes: [{ id: "n1", x: 160, y: 90, kind: "start", weight: 3000 }],
      edges: [],
      stats: {
        nodeCount: 3000,
        edgeCount: 4000,
        startCount: 1,
        endCount: 10,
        sampled: true,
        shownNodes: 250,
        shownEdges: 500,
      },
    };
    const loader = createMockLoader({ status: "ready", data: sampledData });
    const html = renderToStaticMarkup(
      React.createElement(StoryThumbnailView, {
        projectId: "p-bench",
        latestVersion: 1,
        loader,
        variant: "card",
      }),
    );

    expect(html).toContain("3,000 nodes · 4,000 edges · 10 endings");
    expect(html).toContain("Overview of 3,000 nodes");
    expect(html).toContain('title="Showing 250 of 3,000 nodes"');
  });
});
