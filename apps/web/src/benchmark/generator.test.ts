import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { ProjectSchema } from "@repo/schema";
import { check } from "@repo/checker";
import { parseCondition, parseEffect } from "@repo/dsl";
import { validateProjectDocument } from "../persistence/parse.js";
import { serializeProject } from "../persistence/serialize.js";
import {
  generateBenchmarkProject,
  generateBenchmarkWithDefects,
} from "./generator.js";

function extractSpeaker(title: string): string {
  const colonIndex = title.indexOf(":");
  return colonIndex !== -1 ? title.slice(0, colonIndex).trim() : title;
}

describe("Benchmark Story Generator", () => {
  describe("Determinism", () => {
    it("returns deep-equal project for identical options", () => {
      const proj1 = generateBenchmarkProject({
        seed: 42,
        nodeCount: 50,
        castSize: 10,
        endingCount: 3,
        variableCount: 5,
      });
      const proj2 = generateBenchmarkProject({
        seed: 42,
        nodeCount: 50,
        castSize: 10,
        endingCount: 3,
        variableCount: 5,
      });
      expect(proj1).toEqual(proj2);
    });

    it("returns different project structure for different seeds", () => {
      const proj1 = generateBenchmarkProject({ seed: 101, nodeCount: 50 });
      const proj2 = generateBenchmarkProject({ seed: 202, nodeCount: 50 });
      expect(proj1).not.toEqual(proj2);
    });
  });

  describe("Exact counts and types", () => {
    const testCounts = [50, 300, 1000];

    for (const count of testCounts) {
      it(`produces exact nodeCount ${count} with 1 start, endingCount endings, and remainder scenes`, () => {
        const endingCount = 4;
        const project = generateBenchmarkProject({
          seed: 12345,
          nodeCount: count,
          endingCount,
        });

        expect(project.nodes.length).toBe(count);

        const startNodes = project.nodes.filter((n) => n.type === "start");
        const endNodes = project.nodes.filter((n) => n.type === "end");
        const sceneNodes = project.nodes.filter((n) => n.type === "scene");

        expect(startNodes.length).toBe(1);
        expect(endNodes.length).toBe(endingCount);
        expect(sceneNodes.length).toBe(count - 1 - endingCount);

        // All IDs must be unique
        const nodeIds = new Set(project.nodes.map((n) => n.id));
        expect(nodeIds.size).toBe(project.nodes.length);

        const edgeIds = new Set(project.edges.map((e) => e.id));
        expect(edgeIds.size).toBe(project.edges.length);

        const varIds = new Set(project.variables.map((v) => v.id));
        expect(varIds.size).toBe(project.variables.length);
      });
    }

    it("uses castSize distinct speakers across the story", () => {
      const castSize = 30;
      const project = generateBenchmarkProject({
        seed: 999,
        nodeCount: 100,
        castSize,
      });

      const speakers = new Set(project.nodes.map((n) => extractSpeaker(n.title)));
      expect(speakers.size).toBe(castSize);
    });
  });

  describe("Schema and DSL validity", () => {
    it("satisfies ProjectSchema and validateProjectDocument with zero warnings", () => {
      const project = generateBenchmarkProject({
        seed: 777,
        nodeCount: 50,
      });

      const parseResult = ProjectSchema.safeParse(project);
      expect(parseResult.success).toBe(true);

      const docResult = validateProjectDocument(project);
      expect(docResult.ok).toBe(true);
      if (docResult.ok) {
        expect(docResult.warnings).toEqual([]);
      }
    });

    it("generates character entities matching speakerId on all nodes with short bodies", () => {
      const castSize = 15;
      const project = generateBenchmarkProject({
        seed: 456,
        nodeCount: 60,
        castSize,
      });

      expect(project.entities).toBeDefined();
      expect(project.entities?.length).toBe(castSize);
      const entityIds = new Set(project.entities?.map((e) => e.id));
      for (const ent of project.entities ?? []) {
        expect(ent.kind).toBe("character");
        expect(ent.name.trim().length).toBeGreaterThan(0);
      }

      for (const node of project.nodes) {
        expect(node.speakerId).toBeDefined();
        if (node.speakerId) {
          expect(entityIds.has(node.speakerId)).toBe(true);
        }
        expect(typeof node.body).toBe("string");
        expect(node.body?.length).toBeGreaterThan(0);
        expect(node.body?.length).toBeLessThan(20000);
      }
    });

    it("measures serialized size per node for v1 and v2", () => {
      const p1000 = generateBenchmarkProject({ seed: 42, nodeCount: 1000 });
      const serializedV2 = JSON.stringify(p1000);
      const bytesV2 = new TextEncoder().encode(serializedV2).length;

      // v1 equivalent without entities, speakerId, or body
      const p1000_v1 = {
        id: p1000.id,
        name: p1000.name,
        nodes: p1000.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          position: n.position,
        })),
        edges: p1000.edges,
        variables: p1000.variables,
      };
      const serializedV1 = JSON.stringify(p1000_v1);
      const bytesV1 = new TextEncoder().encode(serializedV1).length;

      const serializedPrettyV1 = serializeProject(p1000_v1, "2026-10-06T00:00:00.000Z");
      const bytesPrettyV1 = new TextEncoder().encode(serializedPrettyV1).length;

      const serializedPrettyV2 = serializeProject(p1000, "2026-10-06T00:00:00.000Z");
      const bytesPrettyV2 = new TextEncoder().encode(serializedPrettyV2).length;

      const v1BytesPerNode = (bytesV1 / 1000).toFixed(1);
      const v2BytesPerNode = (bytesV2 / 1000).toFixed(1);
      const v1PrettyBytesPerNode = (bytesPrettyV1 / 1000).toFixed(1);
      const v2PrettyBytesPerNode = (bytesPrettyV2 / 1000).toFixed(1);
      const maxNodesUnder5MB = Math.floor(5_000_000 / (bytesV2 / 1000));

      console.log(`[MEASUREMENT (c) COMPACT v1]: ${bytesV1} bytes (${v1BytesPerNode} B/node)`);
      console.log(`[MEASUREMENT (c) COMPACT v2]: ${bytesV2} bytes (${v2BytesPerNode} B/node)`);
      console.log(`[MEASUREMENT (a) PRETTY v1]: ${bytesPrettyV1} bytes (${v1PrettyBytesPerNode} B/node)`);
      console.log(`[MEASUREMENT (b) PRETTY v2]: ${bytesPrettyV2} bytes (${v2PrettyBytesPerNode} B/node)`);
      console.log(`[BENCHMARK SCALE] Estimated max v2 nodes under 5 MB limit: ${maxNodesUnder5MB} nodes`);

      expect(bytesV2).toBeGreaterThan(bytesV1);
      expect(maxNodesUnder5MB).toBeGreaterThan(10000);
    });

    it("generates conditions and effects that parse through the real DSL", () => {
      const project = generateBenchmarkProject({
        seed: 888,
        nodeCount: 100,
        variableCount: 10,
      });

      for (const edge of project.edges) {
        if (edge.condition !== undefined) {
          const res = parseCondition(edge.condition);
          expect(res.ok).toBe(true);
        }
        if (edge.effects !== undefined) {
          for (const effect of edge.effects) {
            const res = parseEffect(effect);
            expect(res.ok).toBe(true);
          }
        }
      }
    });
  });

  describe("Checker integration: none mode", () => {
    for (const count of [50, 300, 1000]) {
      it(`reports ZERO checker issues for nodeCount ${count}`, () => {
        const project = generateBenchmarkProject({
          seed: 42 + count,
          nodeCount: count,
          defects: "none",
        });

        const issues = check(project);
        expect(issues).toEqual([]);
      });
    }
  });

  describe("Checker integration: planted mode", () => {
    it("reports exactly the planted defects matching kind and nodeId, and nothing else", () => {
      const { project, defects } = generateBenchmarkWithDefects({
        seed: 54321,
        nodeCount: 100,
        defects: "planted",
      });

      expect(defects.length).toBe(3);

      const issues = check(project);
      expect(issues.length).toBe(defects.length);

      for (const defect of defects) {
        const matchingIssue = issues.find(
          (issue) => issue.ruleId === defect.kind && issue.nodeId === defect.nodeId,
        );
        expect(matchingIssue).toBeDefined();
      }

      // Assert no issues outside of the planted defects
      const defectNodeIds = new Set(defects.map((d) => d.nodeId));
      for (const issue of issues) {
        expect(issue.nodeId).toBeDefined();
        if (issue.nodeId) {
          expect(defectNodeIds.has(issue.nodeId)).toBe(true);
        }
      }
    });

    it("reports exactly planted defects and zero clean issues across seeds 1..100 at sizes 20, 50, 300", () => {
      for (const size of [20, 50, 300]) {
        for (let seed = 1; seed <= 100; seed++) {
          // 1. None mode: 0 issues
          const cleanProject = generateBenchmarkProject({ seed, nodeCount: size, defects: "none" });
          const cleanIssues = check(cleanProject);
          expect(cleanIssues).toEqual([]);

          // 2. Planted mode: exactly 3 planted defects
          const { project: plantedProject, defects } = generateBenchmarkWithDefects({
            seed,
            nodeCount: size,
            defects: "planted",
          });
          const plantedIssues = check(plantedProject);
          expect(plantedIssues.length).toBe(defects.length);

          for (const defect of defects) {
            const match = plantedIssues.find(
              (i) => i.ruleId === defect.kind && i.nodeId === defect.nodeId,
            );
            expect(match).toBeDefined();
          }
        }
      }
    });
  });

  describe("Property test: random seed and nodeCount", () => {
    it("always produces a valid project with exact node count, zero checker issues on none, and exact planted match", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.integer({ min: 20, max: 400 }),
          (seed, nodeCount) => {
            // Clean mode
            const project = generateBenchmarkProject({ seed, nodeCount });
            expect(project.nodes.length).toBe(nodeCount);

            const docResult = validateProjectDocument(project);
            expect(docResult.ok).toBe(true);

            const issues = check(project);
            expect(issues.length).toBe(0);

            // Planted mode
            const { project: plantedProj, defects } = generateBenchmarkWithDefects({
              seed,
              nodeCount,
              defects: "planted",
            });
            expect(plantedProj.nodes.length).toBe(nodeCount);

            const plantedIssues = check(plantedProj);
            expect(plantedIssues.length).toBe(defects.length);

            for (const defect of defects) {
              const match = plantedIssues.find(
                (i) => i.ruleId === defect.kind && i.nodeId === defect.nodeId,
              );
              expect(match).toBeDefined();
            }
          },
        ),
        { numRuns: 25 },
      );
    });
  });
});
