import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Project, FlowNode } from "@repo/schema";
import {
  computeInitialViewport,
  shouldApplyInitialViewport,
  READABLE_ZOOM,
  FIT_READABLE_THRESHOLD,
  FIT_MAX_ZOOM,
  VIEW_PADDING,
  MIN_ZOOM,
  MAX_ZOOM,
  PAN_DURATION,
} from "./initialViewport.js";
import { STORY_NODE_WIDTH, STORY_NODE_HEIGHT } from "../components/StoryNode.js";
import { getSampleProjectWithSyntaxError } from "../demo/sampleProject.js";
import { computeLayout } from "./layout.js";

function makeMinimalProject(nodes: FlowNode[] = []): Project {
  return {
    id: "test-proj",
    name: "Test Project",
    nodes,
    edges: [],
    variables: [],
  };
}

function makeNode(id: string, type: FlowNode["type"] = "scene", explicitPos?: { x: number; y: number }): FlowNode {
  return {
    id,
    type,
    title: `Node ${id}`,
    position: explicitPos,
  };
}

describe("initialViewport unit tests", () => {
  it("exports expected named constants", () => {
    expect(READABLE_ZOOM).toBe(0.85);
    expect(FIT_READABLE_THRESHOLD).toBe(0.6);
    expect(FIT_MAX_ZOOM).toBe(1);
    expect(VIEW_PADDING).toBe(48);
    expect(MIN_ZOOM).toBe(0.1);
    expect(MAX_ZOOM).toBe(2);
    expect(PAN_DURATION).toBe(400);
  });

  describe("computeInitialViewport", () => {
    it("handles empty project (no boxes) -> mode 'fit', default clamped zoom", () => {
      const res = computeInitialViewport({
        project: makeMinimalProject([]),
        positions: new Map(),
        canvas: { width: 1000, height: 800 },
        minZoom: 0.1,
        maxZoom: 2,
      });

      expect(res).toEqual({
        x: 0,
        y: 0,
        zoom: 1,
        mode: "fit",
      });
    });

    it("handles project with nodes but none in positions map -> returns mode 'fit' default", () => {
      const project = makeMinimalProject([makeNode("n1", "start")]);
      const res = computeInitialViewport({
        project,
        positions: new Map(), // empty positions
        canvas: { width: 1000, height: 800 },
        minZoom: 0.1,
        maxZoom: 2,
      });

      expect(res).toEqual({
        x: 0,
        y: 0,
        zoom: 1,
        mode: "fit",
      });
    });

    it("handles invalid canvas sizes (0, negative, NaN, Infinity) safely without throwing or NaN", () => {
      const project = makeMinimalProject([makeNode("n1", "start")]);
      const positions = new Map([["n1", { x: 100, y: 100 }]]);
      const invalidCanvases = [
        { width: 0, height: 800 },
        { width: 1000, height: 0 },
        { width: -100, height: 800 },
        { width: 1000, height: -50 },
        { width: Number.NaN, height: 800 },
        { width: 1000, height: Number.NaN },
        { width: Number.POSITIVE_INFINITY, height: 800 },
        { width: 1000, height: Number.NEGATIVE_INFINITY },
      ];

      for (const canvas of invalidCanvases) {
        const res = computeInitialViewport({
          project,
          positions,
          canvas,
          minZoom: 0.1,
          maxZoom: 2,
        });

        expect(res.mode).toBe("fit");
        expect(res.x).toBe(0);
        expect(res.y).toBe(0);
        expect(res.zoom).toBe(1);
        expect(Number.isFinite(res.x)).toBe(true);
        expect(Number.isFinite(res.y)).toBe(true);
        expect(Number.isFinite(res.zoom)).toBe(true);
      }
    });

    it("small graph fits with fitZoom >= FIT_READABLE_THRESHOLD -> mode 'fit' and all boxes inside canvas", () => {
      // 1 node at (0, 0), canvas 1000x800.
      // Bounds: width = 220, height = 88.
      // Available: 1000 - 96 = 904, 800 - 96 = 704.
      // fitZoom = min(904/220, 704/88) = min(4.109, 8) = 4.109.
      // Clamped to min(fitZoom, FIT_MAX_ZOOM) = 1.
      // 1 >= 0.6 -> mode 'fit', zoom = 1.
      const project = makeMinimalProject([makeNode("start1", "start")]);
      const positions = new Map([["start1", { x: 0, y: 0 }]]);
      const canvas = { width: 1000, height: 800 };

      const res = computeInitialViewport({
        project,
        positions,
        canvas,
        minZoom: 0.1,
        maxZoom: 2,
      });

      expect(res.mode).toBe("fit");
      expect(res.zoom).toBe(1);

      // Verify node box lies inside canvas
      const screenLeft = 0 * res.zoom + res.x;
      const screenRight = (0 + STORY_NODE_WIDTH) * res.zoom + res.x;
      const screenTop = 0 * res.zoom + res.y;
      const screenBottom = (0 + STORY_NODE_HEIGHT) * res.zoom + res.y;

      expect(screenLeft).toBeGreaterThanOrEqual(0);
      expect(screenRight).toBeLessThanOrEqual(canvas.width);
      expect(screenTop).toBeGreaterThanOrEqual(0);
      expect(screenBottom).toBeLessThanOrEqual(canvas.height);

      // Centered: (1000 - 220)/2 = 390, (800 - 88)/2 = 356
      expect(res.x).toBe(390);
      expect(res.y).toBe(356);
    });

    it("large graph with fitZoom < FIT_READABLE_THRESHOLD -> mode 'start' with focus node box fully inside canvas", () => {
      // Create a wide graph: 5 nodes across 2000px
      const nodes = [
        makeNode("start1", "start"),
        makeNode("s1", "scene"),
        makeNode("s2", "scene"),
      ];
      const positions = new Map([
        ["start1", { x: 0, y: 0 }],
        ["s1", { x: 1000, y: 0 }],
        ["s2", { x: 2000, y: 0 }],
      ]);
      const canvas = { width: 800, height: 600 };
      // Bounds: width = 2000 + 220 = 2220. height = 88.
      // Available: 800 - 96 = 704.
      // fitZoom = min(704/2220, 504/88) = ~0.317 < 0.6.
      // mode: 'start'.
      const res = computeInitialViewport({
        project: makeMinimalProject(nodes),
        positions,
        canvas,
        minZoom: 0.1,
        maxZoom: 2,
      });

      expect(res.mode).toBe("start");
      expect(res.zoom).toBe(0.85);

      // Rule 5: x places the focus node's LEFT edge at VIEW_PADDING on screen
      // screenLeft = node.x * zoom + x => VIEW_PADDING = 0 * 0.85 + x => x = VIEW_PADDING = 48
      expect(res.x).toBe(48);

      // Rule 5: y centers the node's box vertically in the canvas
      // canvas.height / 2 - (node.y + STORY_NODE_HEIGHT / 2) * zoom
      // 300 - 44 * 0.85 = 300 - 37.4 = 262.6
      expect(res.y).toBe(600 / 2 - (0 + STORY_NODE_HEIGHT / 2) * 0.85);

      // Focus node box is fully inside canvas
      const screenLeft = 0 * res.zoom + res.x;
      const screenRight = (0 + STORY_NODE_WIDTH) * res.zoom + res.x;
      const screenTop = 0 * res.zoom + res.y;
      const screenBottom = (0 + STORY_NODE_HEIGHT) * res.zoom + res.y;

      expect(screenLeft).toBeGreaterThanOrEqual(0);
      expect(screenRight).toBeLessThanOrEqual(canvas.width);
      expect(screenTop).toBeGreaterThanOrEqual(0);
      expect(screenBottom).toBeLessThanOrEqual(canvas.height);
    });

    it("focuses start node with an explicit non-zero position", () => {
      // Add a distant node so boundsWidth is large and fitZoom < 0.6, triggering mode 'start'
      const nodes = [
        makeNode("start1", "start", { x: 500, y: 300 }),
        makeNode("s1", "scene", { x: 2000, y: 300 }),
      ];
      const positions = new Map([
        ["start1", { x: 500, y: 300 }],
        ["s1", { x: 2000, y: 300 }],
      ]);
      const canvas = { width: 800, height: 600 };

      const res = computeInitialViewport({
        project: makeMinimalProject(nodes),
        positions,
        canvas,
        minZoom: 0.1,
        maxZoom: 2,
      });

      expect(res.mode).toBe("start");
      expect(res.zoom).toBe(0.85);
      // Screen left of start node: 500 * 0.85 + x = VIEW_PADDING (48) => x = 48 - 425 = -377
      expect(res.x).toBe(VIEW_PADDING - 500 * 0.85);
      // Screen vertical center of start node: 600 / 2 - (300 + 44) * 0.85 = 300 - 292.4 = 7.6
      expect(res.y).toBe(canvas.height / 2 - (300 + STORY_NODE_HEIGHT / 2) * 0.85);

      const screenLeft = 500 * res.zoom + res.x;
      expect(screenLeft).toBe(VIEW_PADDING);
    });

    it("no start node -> uses first node in project.nodes order that has a position", () => {
      const nodes = [
        makeNode("scene_unpositioned", "scene"),
        makeNode("scene1", "scene"),
        makeNode("scene2", "scene"),
      ];
      // Only scene1 and scene2 have positions
      const positions = new Map([
        ["scene1", { x: 100, y: 200 }],
        ["scene2", { x: 2000, y: 200 }],
      ]);
      const canvas = { width: 600, height: 400 };

      const res = computeInitialViewport({
        project: makeMinimalProject(nodes),
        positions,
        canvas,
        minZoom: 0.1,
        maxZoom: 2,
      });

      expect(res.mode).toBe("start");
      // Focus node must be scene1
      expect(res.x).toBe(VIEW_PADDING - 100 * 0.85);
      expect(res.y).toBe(canvas.height / 2 - (200 + STORY_NODE_HEIGHT / 2) * 0.85);
    });

    it("multiple start nodes -> uses FIRST start node in project.nodes order that has a position", () => {
      const nodes = [
        makeNode("start_unpositioned", "start"),
        makeNode("start1", "start"),
        makeNode("start2", "start"),
      ];
      const positions = new Map([
        ["start1", { x: 200, y: 150 }],
        ["start2", { x: 1500, y: 150 }],
      ]);
      const canvas = { width: 600, height: 400 };

      const res = computeInitialViewport({
        project: makeMinimalProject(nodes),
        positions,
        canvas,
        minZoom: 0.1,
        maxZoom: 2,
      });

      expect(res.mode).toBe("start");
      // Focus node must be start1
      expect(res.x).toBe(VIEW_PADDING - 200 * 0.85);
      expect(res.y).toBe(canvas.height / 2 - (150 + STORY_NODE_HEIGHT / 2) * 0.85);
    });

    it("fit zoom exactly at threshold (>= 0.6 is 'fit')", () => {
      // Configure canvas and bounds such that available / bounds === 0.6
      // bounds: 1 node: width = 220, height = 88.
      // availableWidth = 220 * 0.6 = 132 => canvas.width = 132 + 2*48 = 228.
      // availableHeight = 88 * 0.6 = 52.8 => canvas.height = 52.8 + 2*48 = 148.8.
      const project = makeMinimalProject([makeNode("n1", "start")]);
      const positions = new Map([["n1", { x: 0, y: 0 }]]);
      const canvas = { width: 228, height: 148.8 };

      const res = computeInitialViewport({
        project,
        positions,
        canvas,
        minZoom: 0.1,
        maxZoom: 2,
      });

      expect(res.mode).toBe("fit");
      expect(res.zoom).toBeCloseTo(0.6, 5);
    });

    it("zoom clamped to minZoom and to maxZoom", () => {
      const project = makeMinimalProject([makeNode("n1", "start")]);
      const positions = new Map([["n1", { x: 0, y: 0 }]]);

      // When minZoom is set higher than READABLE_ZOOM (e.g. 0.9 > 0.85) in start mode
      const resMin = computeInitialViewport({
        project: makeMinimalProject([makeNode("n1", "start"), makeNode("n2", "scene")]),
        positions: new Map([["n1", { x: 0, y: 0 }], ["n2", { x: 5000, y: 0 }]]),
        canvas: { width: 500, height: 400 },
        minZoom: 0.9,
        maxZoom: 2.0,
      });
      expect(resMin.mode).toBe("start");
      expect(resMin.zoom).toBe(0.9);

      // When maxZoom is set lower than fit zoom (e.g. maxZoom = 0.5 with fitZoom >= 0.6)
      const resMax = computeInitialViewport({
        project,
        positions,
        canvas: { width: 1000, height: 800 },
        minZoom: 0.1,
        maxZoom: 0.5,
      });
      expect(resMax.mode).toBe("fit");
      expect(resMax.zoom).toBe(0.5);
    });

    it("evaluates sample project at 860x700 and 1500x900 canvases", () => {
      const sample = getSampleProjectWithSyntaxError(false);
      const layout = computeLayout(sample);

      // 860x700: sample graph spans ~3260px, fit zoom is ~0.24 < 0.6 => mode 'start'
      const res860 = computeInitialViewport({
        project: sample,
        positions: layout,
        canvas: { width: 860, height: 700 },
        minZoom: 0.1,
        maxZoom: 2.0,
      });
      expect(res860.mode).toBe("start");
      expect(res860.zoom).toBe(0.85);

      // Focus node (first start node)
      const firstStart = sample.nodes.find((n) => n.type === "start" && layout.has(n.id));
      expect(firstStart).toBeDefined();
      if (!firstStart) throw new Error("Expected firstStart to be defined");
      const startPos = layout.get(firstStart.id);
      expect(startPos).toBeDefined();
      if (!startPos) throw new Error("Expected startPos to be defined");

      // Assert focus node box is inside canvas
      const left860 = startPos.x * res860.zoom + res860.x;
      const right860 = (startPos.x + STORY_NODE_WIDTH) * res860.zoom + res860.x;
      const top860 = startPos.y * res860.zoom + res860.y;
      const bottom860 = (startPos.y + STORY_NODE_HEIGHT) * res860.zoom + res860.y;

      expect(left860).toBeGreaterThanOrEqual(0);
      expect(right860).toBeLessThanOrEqual(860);
      expect(top860).toBeGreaterThanOrEqual(0);
      expect(bottom860).toBeLessThanOrEqual(700);

      // 1500x900: availableWidth = 1500 - 96 = 1404. 1404 / 3260 = ~0.43 < 0.6 => still mode 'start'
      const res1500 = computeInitialViewport({
        project: sample,
        positions: layout,
        canvas: { width: 1500, height: 900 },
        minZoom: 0.1,
        maxZoom: 2.0,
      });
      expect(res1500.mode).toBe("start");
      expect(res1500.zoom).toBe(0.85);

      const left1500 = startPos.x * res1500.zoom + res1500.x;
      const right1500 = (startPos.x + STORY_NODE_WIDTH) * res1500.zoom + res1500.x;
      const top1500 = startPos.y * res1500.zoom + res1500.y;
      const bottom1500 = (startPos.y + STORY_NODE_HEIGHT) * res1500.zoom + res1500.y;

      expect(left1500).toBeGreaterThanOrEqual(0);
      expect(right1500).toBeLessThanOrEqual(1500);
      expect(top1500).toBeGreaterThanOrEqual(0);
      expect(bottom1500).toBeLessThanOrEqual(900);
    });

    it("is completely deterministic", () => {
      const sample = getSampleProjectWithSyntaxError(false);
      const layout = computeLayout(sample);
      const input = {
        project: sample,
        positions: layout,
        canvas: { width: 1024, height: 768 },
        minZoom: 0.1,
        maxZoom: 2.0,
      };

      const res1 = computeInitialViewport(input);
      const res2 = computeInitialViewport(input);
      expect(res1).toEqual(res2);
    });
  });

  describe("shouldApplyInitialViewport", () => {
    it("returns false when canvas not measured yet (0, negative, NaN, Infinity)", () => {
      expect(shouldApplyInitialViewport({ loadCounter: 1, lastApplied: 0, width: 0, height: 800 })).toBe(false);
      expect(shouldApplyInitialViewport({ loadCounter: 1, lastApplied: 0, width: 800, height: 0 })).toBe(false);
      expect(shouldApplyInitialViewport({ loadCounter: 1, lastApplied: 0, width: -100, height: 800 })).toBe(false);
      expect(shouldApplyInitialViewport({ loadCounter: 1, lastApplied: 0, width: Number.NaN, height: 800 })).toBe(false);
      expect(shouldApplyInitialViewport({ loadCounter: 1, lastApplied: 0, width: 800, height: Number.POSITIVE_INFINITY })).toBe(false);
    });

    it("returns false when already applied (loadCounter === lastApplied)", () => {
      expect(shouldApplyInitialViewport({ loadCounter: 1, lastApplied: 1, width: 800, height: 600 })).toBe(false);
      expect(shouldApplyInitialViewport({ loadCounter: 5, lastApplied: 5, width: 1200, height: 900 })).toBe(false);
    });

    it("returns true when valid measurement and loadCounter !== lastApplied", () => {
      expect(shouldApplyInitialViewport({ loadCounter: 1, lastApplied: 0, width: 800, height: 600 })).toBe(true);
      expect(shouldApplyInitialViewport({ loadCounter: 2, lastApplied: 1, width: 800, height: 600 })).toBe(true);
    });

    it("returns false on window resize when loadCounter remains the same", () => {
      // First applied at 800x600: lastApplied is now 1
      expect(shouldApplyInitialViewport({ loadCounter: 1, lastApplied: 1, width: 1024, height: 768 })).toBe(false);
    });
  });
});

describe("initialViewport property tests (fast-check)", () => {
  // Constrained generator per Clarification 7
  const nodeArb = fc.record({
    id: fc.stringMatching(/^[a-z0-9_]{3,8}$/),
    type: fc.constantFrom<FlowNode["type"]>("start", "scene", "end"),
    title: fc.string(),
  });

  it("Property 1: valid canvases >= 400x300, minZoom in [0.05, 0.5], maxZoom in [1, 4]", () => {
    fc.assert(
      fc.property(
        fc.array(nodeArb, { minLength: 1, maxLength: 15 }),
        fc.integer({ min: 400, max: 3000 }),
        fc.integer({ min: 300, max: 2000 }),
        fc.double({ min: 0.05, max: 0.5, noNaN: true }),
        fc.double({ min: 1.0, max: 4.0, noNaN: true }),
        (nodes, width, height, minZoom, maxZoom) => {
          // Guarantee unique IDs
          const uniqueNodes: FlowNode[] = [];
          const seen = new Set<string>();
          for (const n of nodes) {
            if (!seen.has(n.id)) {
              seen.add(n.id);
              uniqueNodes.push(n);
            }
          }
          if (uniqueNodes.length === 0) return true;

          // Generate positions for a subset of nodes
          const positions = new Map<string, { x: number; y: number }>();
          for (let i = 0; i < uniqueNodes.length; i++) {
            const n = uniqueNodes[i];
            if (n) {
              positions.set(n.id, { x: i * 300, y: (i % 3) * 150 });
            }
          }

          const project = makeMinimalProject(uniqueNodes);
          const canvas = { width, height };

          const res = computeInitialViewport({
            project,
            positions,
            canvas,
            minZoom,
            maxZoom,
          });

          // Invariants:
          // 1. All output numbers are finite
          expect(Number.isFinite(res.x)).toBe(true);
          expect(Number.isFinite(res.y)).toBe(true);
          expect(Number.isFinite(res.zoom)).toBe(true);

          // 2. zoom within [minZoom, maxZoom]
          expect(res.zoom).toBeGreaterThanOrEqual(minZoom - 1e-6);
          expect(res.zoom).toBeLessThanOrEqual(maxZoom + 1e-6);

          if (res.mode === "start") {
            // Focus node box lies fully inside canvas
            const focusNode =
              uniqueNodes.find((n) => n.type === "start" && positions.has(n.id)) ??
              uniqueNodes.find((n) => positions.has(n.id));
            expect(focusNode).toBeDefined();
            if (!focusNode) throw new Error("Expected focusNode to be defined");
            const pos = positions.get(focusNode.id);
            expect(pos).toBeDefined();
            if (!pos) throw new Error("Expected pos to be defined");

            const boxLeft = pos.x * res.zoom + res.x;
            const boxRight = (pos.x + STORY_NODE_WIDTH) * res.zoom + res.x;
            const boxTop = pos.y * res.zoom + res.y;
            const boxBottom = (pos.y + STORY_NODE_HEIGHT) * res.zoom + res.y;

            expect(boxLeft).toBeGreaterThanOrEqual(-1e-6);
            expect(boxRight).toBeLessThanOrEqual(width + 1e-6);
            expect(boxTop).toBeGreaterThanOrEqual(-1e-6);
            expect(boxBottom).toBeLessThanOrEqual(height + 1e-6);
          } else if (res.mode === "fit") {
            // All boxes lie inside canvas
            for (const [, pos] of positions) {
              const boxLeft = pos.x * res.zoom + res.x;
              const boxRight = (pos.x + STORY_NODE_WIDTH) * res.zoom + res.x;
              const boxTop = pos.y * res.zoom + res.y;
              const boxBottom = (pos.y + STORY_NODE_HEIGHT) * res.zoom + res.y;

              expect(boxLeft).toBeGreaterThanOrEqual(-1e-6);
              expect(boxRight).toBeLessThanOrEqual(width + 1e-6);
              expect(boxTop).toBeGreaterThanOrEqual(-1e-6);
              expect(boxBottom).toBeLessThanOrEqual(height + 1e-6);
            }
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 2: arbitrary canvases and zoom limits (including NaN, Infinity, negative)", () => {
    fc.assert(
      fc.property(
        fc.array(nodeArb, { maxLength: 8 }),
        fc.oneof(
          fc.integer({ min: -500, max: 2000 }),
          fc.constant(Number.NaN),
          fc.constant(Number.POSITIVE_INFINITY),
          fc.constant(Number.NEGATIVE_INFINITY),
        ),
        fc.oneof(
          fc.integer({ min: -500, max: 2000 }),
          fc.constant(Number.NaN),
          fc.constant(Number.POSITIVE_INFINITY),
          fc.constant(Number.NEGATIVE_INFINITY),
        ),
        fc.float(),
        fc.float(),
        (nodes, width, height, z1, z2) => {
          const minZoom = Math.min(z1, z2);
          const maxZoom = Math.max(z1, z2);

          const positions = new Map<string, { x: number; y: number }>();
          nodes.forEach((n, idx) => {
            positions.set(n.id, { x: idx * 200, y: idx * 100 });
          });

          // Must never throw
          const res = computeInitialViewport({
            project: makeMinimalProject(nodes),
            positions,
            canvas: { width, height },
            minZoom,
            maxZoom,
          });

          // All output numbers finite
          expect(Number.isFinite(res.x)).toBe(true);
          expect(Number.isFinite(res.y)).toBe(true);
          expect(Number.isFinite(res.zoom)).toBe(true);

          if (Number.isFinite(minZoom) && Number.isFinite(maxZoom) && minZoom <= maxZoom) {
            expect(res.zoom).toBeGreaterThanOrEqual(minZoom - 1e-6);
            expect(res.zoom).toBeLessThanOrEqual(maxZoom + 1e-6);
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
