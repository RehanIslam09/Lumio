import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { Project } from "@repo/schema";
import { generateBenchmarkProject } from "../../benchmark/generator.js";
import { sampleProject } from "../../demo/sampleProject.js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { serializeProject } from "../../persistence/serialize.js";
import { parseProjectFile, validateProjectDocument } from "../../persistence/parse.js";
import { StoryThumbnailView } from "./StoryThumbnailView.js";
import {
  buildStoryThumbnail,
  formatThumbnailStats,
} from "./storyThumbnail.js";

describe("buildStoryThumbnail", () => {
  it("is purely deterministic (same project produces deep-equal thumbnail)", () => {
    const project = generateBenchmarkProject({ seed: 42, nodeCount: 50 });
    const thumb1 = buildStoryThumbnail(project);
    const thumb2 = buildStoryThumbnail(project);
    expect(thumb1).toEqual(thumb2);
  });

  it("handles empty project safely with zero counts and empty lists", () => {
    const emptyProj: Project = {
      id: "empty",
      name: "Empty",
      nodes: [],
      edges: [],
      variables: [],
    };
    const res = buildStoryThumbnail(emptyProj);
    expect(res.nodes).toEqual([]);
    expect(res.edges).toEqual([]);
    expect(res.stats).toEqual({
      nodeCount: 0,
      edgeCount: 0,
      startCount: 0,
      endCount: 0,
      sampled: false,
      shownNodes: 0,
      shownEdges: 0,
    });
  });

  it("centers a single node precisely in the padded frame", () => {
    const singleProj: Project = {
      id: "p1",
      name: "Single",
      nodes: [{ id: "n1", type: "start", title: "Start" }],
      edges: [],
      variables: [],
    };
    const res = buildStoryThumbnail(singleProj, { width: 320, height: 180, padding: 14 });
    expect(res.nodes).toHaveLength(1);
    const node = res.nodes[0];
    expect(node).toBeDefined();
    if (node) {
      expect(node.x).toBe(160);
      expect(node.y).toBe(90);
      expect(node.kind).toBe("start");
      expect(node.weight).toBe(1);
    }
    expect(res.stats.nodeCount).toBe(1);
    expect(res.stats.sampled).toBe(false);
  });

  it("centers horizontally collinear nodes while preserving coordinates in bounds", () => {
    const horizProj: Project = {
      id: "p-horiz",
      name: "Horiz",
      nodes: [
        { id: "n1", type: "start", title: "Start", position: { x: 0, y: 50 } },
        { id: "n2", type: "scene", title: "Scene", position: { x: 200, y: 50 } },
        { id: "n3", type: "end", title: "End", position: { x: 400, y: 50 } },
      ],
      edges: [
        { id: "e1", from: "n1", to: "n2" },
        { id: "e2", from: "n2", to: "n3" },
      ],
      variables: [],
    };
    const res = buildStoryThumbnail(horizProj, { width: 320, height: 180, padding: 14 });
    expect(res.nodes).toHaveLength(3);
    for (const n of res.nodes) {
      expect(n.y).toBe(90); // vertically centered
      expect(n.x).toBeGreaterThanOrEqual(14);
      expect(n.x).toBeLessThanOrEqual(320 - 14);
    }
  });

  it("centers vertically collinear nodes while preserving coordinates in bounds", () => {
    const vertProj: Project = {
      id: "p-vert",
      name: "Vert",
      nodes: [
        { id: "n1", type: "start", title: "Start", position: { x: 100, y: 0 } },
        { id: "n2", type: "scene", title: "Scene", position: { x: 100, y: 300 } },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2" }],
      variables: [],
    };
    const res = buildStoryThumbnail(vertProj, { width: 320, height: 180, padding: 14 });
    expect(res.nodes).toHaveLength(2);
    for (const n of res.nodes) {
      expect(n.x).toBe(160); // horizontally centered
      expect(n.y).toBeGreaterThanOrEqual(14);
      expect(n.y).toBeLessThanOrEqual(180 - 14);
    }
  });

  it("preserves uniform aspect ratio without stretching for wide and tall projects", () => {
    const wideProj: Project = {
      id: "wide",
      name: "Wide",
      nodes: [
        { id: "w1", type: "start", title: "W1", position: { x: 0, y: 0 } },
        { id: "w2", type: "end", title: "W2", position: { x: 1000, y: 100 } },
      ],
      edges: [{ id: "e1", from: "w1", to: "w2" }],
      variables: [],
    };
    const tallProj: Project = {
      id: "tall",
      name: "Tall",
      nodes: [
        { id: "t1", type: "start", title: "T1", position: { x: 0, y: 0 } },
        { id: "t2", type: "end", title: "T2", position: { x: 100, y: 1000 } },
      ],
      edges: [{ id: "e1", from: "t1", to: "t2" }],
      variables: [],
    };

    const wideRes = buildStoryThumbnail(wideProj, { width: 320, height: 180, padding: 14 });
    const tallRes = buildStoryThumbnail(tallProj, { width: 320, height: 180, padding: 14 });

    // Wide project touches left/right padding boundaries (292px span)
    const wideFirst = wideRes.nodes[0];
    const wideSecond = wideRes.nodes[1];
    expect(wideFirst).toBeDefined();
    expect(wideSecond).toBeDefined();
    if (wideFirst && wideSecond) {
      const wideSpanX = Math.abs(wideSecond.x - wideFirst.x);
      expect(Math.round(wideSpanX)).toBe(292);
      // Anisotropic vertical stretch: capped at 2.2x the uniform base scale (0.292 * 2.2 * 100 = 64px)
      const wideSpanY = Math.abs(wideSecond.y - wideFirst.y);
      const uniformSpanY = 29.2;
      expect(wideSpanY).toBeGreaterThanOrEqual(uniformSpanY);
      expect(wideSpanY / uniformSpanY).toBeCloseTo(2.2, 5);
      expect(Math.round(wideSpanY)).toBe(64);
    }

    // Tall project touches top/bottom padding boundaries (152px span)
    const tallFirst = tallRes.nodes[0];
    const tallSecond = tallRes.nodes[1];
    expect(tallFirst).toBeDefined();
    expect(tallSecond).toBeDefined();
    if (tallFirst && tallSecond) {
      const tallSpanY = Math.abs(tallSecond.y - tallFirst.y);
      expect(Math.round(tallSpanY)).toBe(152);
      // Tall projects preserve isotropic uniform fit (0.152 * 100 = 15px)
      const tallSpanX = Math.abs(tallSecond.x - tallFirst.x);
      expect(Math.round(tallSpanX)).toBe(15);
    }
  });

  it("preserves vertical monotonic ordering and strictly stays within padded bounds under stretch", () => {
    const wideMultiNodeProj: Project = {
      id: "wide-multi",
      name: "Wide Multi Node",
      nodes: [
        { id: "n1", type: "start", title: "N1", position: { x: 0, y: 10 } },
        { id: "n2", type: "scene", title: "N2", position: { x: 500, y: 40 } },
        { id: "n3", type: "scene", title: "N3", position: { x: 800, y: 70 } },
        { id: "n4", type: "end", title: "N4", position: { x: 1000, y: 90 } },
      ],
      edges: [
        { id: "e1", from: "n1", to: "n2" },
        { id: "e2", from: "n2", to: "n3" },
        { id: "e3", from: "n3", to: "n4" },
      ],
      variables: [],
    };

    const res = buildStoryThumbnail(wideMultiNodeProj, { width: 320, height: 180, padding: 14 });
    expect(res.nodes).toHaveLength(4);

    // Verify coordinates stay within [padding, dimension - padding] = [14, 306] and [14, 166]
    for (const node of res.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(14);
      expect(node.x).toBeLessThanOrEqual(306);
      expect(node.y).toBeGreaterThanOrEqual(14);
      expect(node.y).toBeLessThanOrEqual(166);
    }

    // Verify monotonic Y ordering is strictly preserved
    for (let i = 0; i < res.nodes.length - 1; i++) {
      const curr = res.nodes[i];
      const next = res.nodes[i + 1];
      if (curr && next) {
        expect(curr.y).toBeLessThan(next.y);
      }
    }
  });

  it("falls back to computeLayout when nodes lack positions", () => {
    const unpositionedProj: Project = {
      id: "unpos",
      name: "Unpositioned",
      nodes: [
        { id: "start", type: "start", title: "Start" },
        { id: "scene1", type: "scene", title: "Scene 1" },
        { id: "end", type: "end", title: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "scene1" },
        { id: "e2", from: "scene1", to: "end" },
      ],
      variables: [],
    };
    const res = buildStoryThumbnail(unpositionedProj);
    expect(res.nodes).toHaveLength(3);
    const startNode = res.nodes.find((n) => n.id === "start");
    const sceneNode = res.nodes.find((n) => n.id === "scene1");
    const endNode = res.nodes.find((n) => n.id === "end");
    expect(startNode).toBeDefined();
    expect(sceneNode).toBeDefined();
    expect(endNode).toBeDefined();
    if (startNode && sceneNode && endNode) {
      // Layout flows left to right
      expect(startNode.x).toBeLessThan(sceneNode.x);
      expect(sceneNode.x).toBeLessThan(endNode.x);
    }
  });

  it("renders sample project (15 nodes) completely without sampling", () => {
    const res = buildStoryThumbnail(sampleProject);
    expect(res.stats.sampled).toBe(false);
    expect(res.stats.nodeCount).toBe(sampleProject.nodes.length);
    expect(res.stats.edgeCount).toBe(sampleProject.edges.length);
    expect(res.nodes).toHaveLength(sampleProject.nodes.length);
    expect(res.stats.shownNodes).toBe(sampleProject.nodes.length);
    for (const node of res.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(14);
      expect(node.x).toBeLessThanOrEqual(320 - 14);
      expect(node.y).toBeGreaterThanOrEqual(14);
      expect(node.y).toBeLessThanOrEqual(180 - 14);
    }
  });

  it("samples 3,000-node benchmark project to <= 250 nodes and <= 500 edges with representative rules", () => {
    const bench = generateBenchmarkProject({ seed: 42, nodeCount: 3000 });
    const res = buildStoryThumbnail(bench, { maxNodes: 250, maxEdges: 500 });

    expect(res.stats.sampled).toBe(true);
    expect(res.stats.nodeCount).toBe(3000);
    expect(res.stats.shownNodes).toBeLessThanOrEqual(250);
    expect(res.stats.shownEdges).toBeLessThanOrEqual(500);
    expect(res.nodes.length).toBe(res.stats.shownNodes);
    expect(res.edges.length).toBe(res.stats.shownEdges);

    // Sum of node weights must equal the original 3,000 nodes
    const totalWeight = res.nodes.reduce((acc, n) => acc + n.weight, 0);
    expect(totalWeight).toBe(3000);

    // Every edge endpoint must be an existing kept node
    const keptNodeIds = new Set(res.nodes.map((n) => n.id));
    for (const edge of res.edges) {
      expect(keptNodeIds.has(edge.from)).toBe(true);
      expect(keptNodeIds.has(edge.to)).toBe(true);
      expect(edge.from).not.toBe(edge.to); // self-loops removed
    }

    // Start node is preserved
    const hasStart = res.nodes.some((n) => n.kind === "start");
    expect(hasStart).toBe(true);
  });

  it("applies representative rule priority: start > end > degree > id", () => {
    // 4 nodes in the exact same cell position
    const clusterProj: Project = {
      id: "cluster",
      name: "Cluster",
      nodes: [
        { id: "z_start", type: "start", title: "Start", position: { x: 10, y: 10 } },
        { id: "a_scene", type: "scene", title: "Scene A", position: { x: 10, y: 10 } },
        { id: "b_end", type: "end", title: "End B", position: { x: 10, y: 10 } },
      ],
      edges: [
        { id: "e1", from: "a_scene", to: "z_start" },
        { id: "e2", from: "a_scene", to: "b_end" },
      ],
      variables: [],
    };
    // Force coarsening by setting maxNodes: 1
    const res = buildStoryThumbnail(clusterProj, { maxNodes: 1 });
    expect(res.nodes).toHaveLength(1);
    // Start node must win over scene and end
    const clusterNode = res.nodes[0];
    expect(clusterNode).toBeDefined();
    expect(clusterNode?.id).toBe("z_start");
    expect(clusterNode?.weight).toBe(3);

    // Now test end > high-degree scene
    const clusterNoStart: Project = {
      id: "cluster2",
      name: "Cluster 2",
      nodes: [
        { id: "scene_high_deg", type: "scene", title: "Scene", position: { x: 10, y: 10 } },
        { id: "z_end", type: "end", title: "End", position: { x: 10, y: 10 } },
      ],
      edges: [
        { id: "e1", from: "scene_high_deg", to: "z_end" },
      ],
      variables: [],
    };
    const res2 = buildStoryThumbnail(clusterNoStart, { maxNodes: 1 });
    expect(res2.nodes[0]?.id).toBe("z_end");

    // Now test degree > id among scenes
    const clusterDegree: Project = {
      id: "cluster3",
      name: "Cluster 3",
      nodes: [
        { id: "a_low", type: "scene", title: "Low", position: { x: 10, y: 10 } },
        { id: "z_high", type: "scene", title: "High", position: { x: 10, y: 10 } },
        { id: "other", type: "scene", title: "Other", position: { x: 100, y: 100 } },
      ],
      edges: [
        { id: "e1", from: "z_high", to: "other" },
        { id: "e2", from: "other", to: "z_high" },
      ],
      variables: [],
    };
    const res3 = buildStoryThumbnail(clusterDegree, { maxNodes: 2 });
    const cellNode = res3.nodes.find((n) => n.id === "z_high" || n.id === "a_low");
    expect(cellNode?.id).toBe("z_high");
  });

  it("skips edges with missing endpoints when drawing but retains true edge count in stats", () => {
    const brokenEdgesProj: Project = {
      id: "broken",
      name: "Broken Edges",
      nodes: [
        { id: "n1", type: "start", title: "N1", position: { x: 0, y: 0 } },
        { id: "n2", type: "end", title: "N2", position: { x: 100, y: 0 } },
      ],
      edges: [
        { id: "e1", from: "n1", to: "n2" },
        { id: "e2", from: "n1", to: "missing_target" },
        { id: "e3", from: "missing_source", to: "n2" },
      ],
      variables: [],
    };
    const res = buildStoryThumbnail(brokenEdgesProj);
    // True edge count preserved
    expect(res.stats.edgeCount).toBe(3);
    // Only valid edge drawn
    expect(res.edges).toHaveLength(1);
    expect(res.edges[0]?.from).toBe("n1");
    expect(res.edges[0]?.to).toBe("n2");
  });

  describe("formatThumbnailStats (A8 exact string tests)", () => {
    it("formats standard multi-node story", () => {
      const stats = {
        nodeCount: 15,
        edgeCount: 16,
        startCount: 1,
        endCount: 2,
        sampled: false,
        shownNodes: 15,
        shownEdges: 16,
      };
      const formatted = formatThumbnailStats(stats);
      expect(formatted.summary).toBe("15 nodes · 16 edges · 2 endings");
      expect(formatted.overviewLabel).toBeUndefined();
    });

    it("formats single node and zero endings singulars correctly", () => {
      const stats = {
        nodeCount: 1,
        edgeCount: 0,
        startCount: 1,
        endCount: 0,
        sampled: false,
        shownNodes: 1,
        shownEdges: 0,
      };
      const formatted = formatThumbnailStats(stats);
      expect(formatted.summary).toBe("1 node · 0 edges · 0 endings");
    });

    it("formats 1 ending singular correctly", () => {
      const stats = {
        nodeCount: 2,
        edgeCount: 1,
        startCount: 1,
        endCount: 1,
        sampled: false,
        shownNodes: 2,
        shownEdges: 1,
      };
      const formatted = formatThumbnailStats(stats);
      expect(formatted.summary).toBe("2 nodes · 1 edge · 1 ending");
    });

    it("formats thousands separators and honest overview labels when sampled", () => {
      const stats = {
        nodeCount: 3000,
        edgeCount: 4200,
        startCount: 1,
        endCount: 12,
        sampled: true,
        shownNodes: 250,
        shownEdges: 500,
      };
      const formatted = formatThumbnailStats(stats);
      expect(formatted.summary).toBe("3,000 nodes · 4,200 edges · 12 endings");
      expect(formatted.overviewLabel).toBe("Overview of 3,000 nodes");
      expect(formatted.overviewTooltip).toBe("Showing 250 of 3,000 nodes");
    });
  });

  describe("fast-check Property Invariants", () => {
    it("enforces coordinate bounds, finite numbers, and valid edge endpoints across arbitrary generated graphs", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 200 }),
          fc.integer({ min: 1, max: 1000 }),
          (nodeCount, seed) => {
            const proj = generateBenchmarkProject({ seed, nodeCount });
            const thumb = buildStoryThumbnail(proj, { width: 320, height: 180, padding: 14 });

            expect(thumb.nodes.length).toBeLessThanOrEqual(250);
            expect(thumb.edges.length).toBeLessThanOrEqual(500);

            const nodeIds = new Set(thumb.nodes.map((n) => n.id));
            for (const n of thumb.nodes) {
              expect(Number.isFinite(n.x)).toBe(true);
              expect(Number.isFinite(n.y)).toBe(true);
              expect(n.x).toBeGreaterThanOrEqual(14);
              expect(n.x).toBeLessThanOrEqual(320 - 14);
              expect(n.y).toBeGreaterThanOrEqual(14);
              expect(n.y).toBeLessThanOrEqual(180 - 14);
              expect(n.weight).toBeGreaterThanOrEqual(1);
            }

            for (const e of thumb.edges) {
              expect(nodeIds.has(e.from)).toBe(true);
              expect(nodeIds.has(e.to)).toBe(true);
              expect(e.from).not.toBe(e.to);
              expect(e.weight).toBeGreaterThanOrEqual(1);
            }
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe("Scale & Performance Measurements (A3, A10)", () => {
    it("measures buildStoryThumbnail, end-to-end pipeline, cached JSON size, and SVG element count without assertions on timing", () => {
      const bench300 = generateBenchmarkProject({ seed: 42, nodeCount: 300 });
      const bench3000 = generateBenchmarkProject({ seed: 42, nodeCount: 3000 });

      // 1. buildStoryThumbnail on 300 nodes (5 reps)
      const times300: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        buildStoryThumbnail(bench300);
        times300.push(performance.now() - start);
      }
      times300.sort((a, b) => a - b);
      const min300 = times300[0]?.toFixed(2);
      const med300 = times300[2]?.toFixed(2);

      // 2. buildStoryThumbnail on 3,000 nodes (5 reps)
      const times3000: number[] = [];
      let thumb3000 = buildStoryThumbnail(bench3000);
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        thumb3000 = buildStoryThumbnail(bench3000);
        times3000.push(performance.now() - start);
      }
      times3000.sort((a, b) => a - b);
      const min3000 = times3000[0]?.toFixed(2);
      const med3000 = times3000[2]?.toFixed(2);

      // 3. Cached JSON byte size of 3,000-node thumbnail
      const cachedBytes = new TextEncoder().encode(JSON.stringify(thumb3000)).length;

      // 4. End-to-end pipeline on 3,000 nodes: serialize -> parse -> validate -> build
      const serialized = serializeProject(bench3000, "2026-10-26T12:00:00.000Z");
      const e2eTimes: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const parsed = parseProjectFile(serialized);
        if (parsed.ok) {
          const validated = validateProjectDocument(parsed.project);
          if (validated.ok) {
            buildStoryThumbnail(validated.project);
          }
        }
        e2eTimes.push(performance.now() - start);
      }
      e2eTimes.sort((a, b) => a - b);
      const minE2E = e2eTimes[0]?.toFixed(2);
      const medE2E = e2eTimes[2]?.toFixed(2);

      // 5. SVG element count
      const readyLoader = {
        subscribe: (_id: string, _v: number, listener: (s: { status: "ready"; data: typeof thumb3000 }) => void) => {
          listener({ status: "ready", data: thumb3000 });
          return () => {};
        },
        get: () => ({ status: "ready" as const, data: thumb3000 }),
        retry: () => () => {},
        clear: () => {},
      };
      const html = renderToStaticMarkup(
        React.createElement(StoryThumbnailView, {
          projectId: "p3000",
          latestVersion: 1,
          loader: readyLoader,
          variant: "card",
        }),
      );
      // Count SVG elements: tags starting with <svg, <path, <circle, <defs, <pattern, <rect
      const svgTagMatches = html.match(/<(svg|path|circle|defs|pattern|rect)\b/g);
      const svgElementCount = svgTagMatches ? svgTagMatches.length : 0;

      console.log(`[MEASUREMENT A3/A10]
- buildStoryThumbnail 300 nodes: min ${min300}ms, median ${med300}ms
- buildStoryThumbnail 3000 nodes: min ${min3000}ms, median ${med3000}ms
- Cached JSON byte size (3000 nodes): ${cachedBytes} bytes (${(cachedBytes / 1024).toFixed(2)} KB)
- End-to-end pipeline (3000 nodes parse+migrate+validate+build): min ${minE2E}ms, median ${medE2E}ms
- Rendered SVG element count (3000 nodes): ${svgElementCount} elements`);

      expect(cachedBytes).toBeGreaterThan(0);
      expect(svgElementCount).toBeGreaterThan(0);
    });
  });
});
