import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { Entity, FlowNode, Project } from "@repo/schema";
import { check } from "@repo/checker";
import { duplicateNameIds, speakerUsage } from "./entities.js";
import { sampleProject } from "../demo/sampleProject.js";
import { parseProjectFile } from "../persistence/parse.js";
import sampleFixture from "../persistence/fixtures/v1-sample.lumio.json";
import branchingFixture from "../persistence/fixtures/v1-branching.lumio.json";

describe("apps/web checker parity and integration tests", () => {
  const NAME_POOL = [
    "Alice",
    "alice",
    "  Alice  ",
    "Bob",
    "bob",
    "Charlie",
    "🎭 Bard",
    "🎭 bard",
    "  🎭 BARD  ",
    "Dragon",
    "Tavern",
    "tavern",
    "Sword",
  ];

  describe("Item 2: Shared semantics parity tests (checker rules vs UI helpers)", () => {
    it("property test: duplicate-entity-name set equals duplicateNameIds and character-never-speaks equals zero speakerUsage", () => {
      let duplicateCases = 0;
      let nonDuplicateCases = 0;
      let silentCharCases = 0;
      let speakingCharCases = 0;

      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 6 }).chain((entityCount) => {
            const entityIds = Array.from({ length: entityCount }, (_, i) => `ent_${i}`);
            return fc
              .record({
                entities: fc.tuple(
                  ...entityIds.map((id) =>
                    fc.record({
                      id: fc.constant(id),
                      kind: fc.constantFrom<Entity["kind"]>("character", "location", "item"),
                      name: fc.constantFrom(...NAME_POOL),
                      description: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
                    }),
                  ),
                ),
                nodeCount: fc.integer({ min: 1, max: 5 }),
              })
              .chain(({ entities, nodeCount }) => {
                const charIds = entities.filter((e) => e.kind === "character").map((e) => e.id);
                return fc
                  .array(
                    fc.record({
                      speakerId: fc.option(
                        charIds.length > 0 ? fc.constantFrom(...charIds) : fc.constant("ghost"),
                        { nil: undefined },
                      ),
                      body: fc.constantFrom("Spoken line", "Another line"),
                    }),
                    { minLength: nodeCount, maxLength: nodeCount },
                  )
                  .map((nodeSpecs) => {
                    const nodes: FlowNode[] = nodeSpecs.map((spec, i) => ({
                      id: `node_${i}`,
                      type: i === 0 ? "start" : "scene",
                      title: `Node ${i}`,
                      speakerId: spec.speakerId,
                      body: spec.body,
                    }));
                    return {
                      id: "parity_proj",
                      name: "Parity Project",
                      nodes,
                      edges: [],
                      variables: [],
                      entities,
                    } satisfies Project;
                  });
              });
          }),
          (project) => {
            const issues = check(project);

            // 1. Parity test: duplicate-entity-name issues vs duplicateNameIds(project)
            const checkerDuplicateEntityIds = new Set(
              issues
                .filter((i) => i.ruleId === "duplicate-entity-name")
                .map((i) => i.entityId)
                .filter((id): id is string => id !== undefined),
            );
            const helperDuplicateEntityIds = duplicateNameIds(project);
            expect(checkerDuplicateEntityIds).toEqual(helperDuplicateEntityIds);

            if (helperDuplicateEntityIds.size > 0) {
              duplicateCases++;
            } else {
              nonDuplicateCases++;
            }

            // 2. Parity test: character-never-speaks issues vs speakerUsage(project)
            const checkerNeverSpeaksEntityIds = new Set(
              issues
                .filter((i) => i.ruleId === "character-never-speaks")
                .map((i) => i.entityId)
                .filter((id): id is string => id !== undefined),
            );

            const usage = speakerUsage(project);
            const characterEntities = (project.entities ?? []).filter((e) => e.kind === "character");
            const helperNeverSpeaksEntityIds = new Set(
              characterEntities
                .filter((char) => (usage.get(char.id) ?? []).length === 0)
                .map((char) => char.id),
            );
            expect(checkerNeverSpeaksEntityIds).toEqual(helperNeverSpeaksEntityIds);

            if (helperNeverSpeaksEntityIds.size > 0) {
              silentCharCases++;
            } else {
              speakingCharCases++;
            }
          },
        ),
        { numRuns: 100 },
      );

      console.log(
        `[PARITY DISTRIBUTION 100 runs] duplicates: ${duplicateCases}, non-duplicates: ${nonDuplicateCases}; silent-characters: ${silentCharCases}, speaking-characters: ${speakingCharCases}`,
      );
      expect(duplicateCases).toBeGreaterThan(0);
      expect(nonDuplicateCases).toBeGreaterThan(0);
      expect(silentCharCases).toBeGreaterThan(0);
      expect(speakingCharCases).toBeGreaterThan(0);
    });
  });

  describe("Item 3: Duplicate entity IDs arbitrary input semantics", () => {
    it("ignores subsequent duplicate entity IDs in check() and UI helpers", () => {
      const project: Project = {
        id: "proj_dup_ids",
        name: "Duplicate IDs Project",
        nodes: [
          { id: "n1", type: "start", title: "N1", speakerId: "e1", body: "Dialogue" },
        ],
        edges: [],
        variables: [],
        entities: [
          { id: "e1", kind: "character", name: "Alice" },
          { id: "e1", kind: "location", name: "Bob" }, // Duplicate ID: ignored
          { id: "e2", kind: "character", name: "Alice" }, // Duplicate name with first e1
        ],
      };

      const issues = check(project);

      // Issues anchored only to first occurrences e1 and e2
      for (const issue of issues) {
        if (issue.entityId) {
          expect(issue.entityId === "e1" || issue.entityId === "e2").toBe(true);
        }
      }

      // e1 spoke, so only e2 has character-never-speaks
      const neverSpeaks = issues.filter((i) => i.ruleId === "character-never-speaks");
      expect(neverSpeaks).toEqual([
        {
          ruleId: "character-never-speaks",
          severity: "warning",
          entityId: "e2",
          message: 'Character "Alice" is never used as a speaker.',
        },
      ]);

      // e1 and e2 have duplicate name "Alice"
      const dupNames = issues.filter((i) => i.ruleId === "duplicate-entity-name");
      expect(dupNames).toEqual([
        {
          ruleId: "duplicate-entity-name",
          severity: "warning",
          entityId: "e1",
          message: 'Duplicate character name "Alice".',
        },
        {
          ruleId: "duplicate-entity-name",
          severity: "warning",
          entityId: "e2",
          message: 'Duplicate character name "Alice".',
        },
      ]);
    });
  });

  describe("Golden v1 and sampleProject fixtures", () => {
    it("sampleProject produces zero entity-related checker issues", () => {
      const issues = check(sampleProject);
      const entityIssues = issues.filter(
        (i) =>
          i.ruleId === "invalid-speaker" ||
          i.ruleId === "speaker-without-text" ||
          i.ruleId === "character-never-speaks" ||
          i.ruleId === "duplicate-entity-name",
      );
      expect(entityIssues).toEqual([]);
    });

    it("golden v1 sample fixture produces byte-identical issues to before", () => {
      const parsed = parseProjectFile(JSON.stringify(sampleFixture));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        const issues = check(parsed.project);
        expect(issues.some((i) => i.ruleId === "unreachable-from-start")).toBe(true);
        expect(issues.some((i) => i.ruleId === "cannot-reach-end")).toBe(true);
        expect(issues.filter((i) => i.entityId !== undefined)).toEqual([]);
      }
    });

    it("golden v1 branching fixture produces byte-identical issues to before", () => {
      const parsed = parseProjectFile(JSON.stringify(branchingFixture));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        const issues = check(parsed.project);
        expect(issues).toEqual([
          {
            ruleId: "variable-never-read",
            severity: "warning",
            variableId: "var_visited",
            message: 'Variable "visited_crossroads" is written but never read.',
          },
        ]);
        expect(issues.filter((i) => i.entityId !== undefined)).toEqual([]);
      }
    });
  });
});
