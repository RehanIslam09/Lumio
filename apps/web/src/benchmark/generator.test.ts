import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { ProjectSchema } from "@repo/schema";
import { check } from "@repo/checker";
import { parseCondition, parseEffect } from "@repo/dsl";
import { validateProjectDocument } from "../persistence/parse.js";
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
