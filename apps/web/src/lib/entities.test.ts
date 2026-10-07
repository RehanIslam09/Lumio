import { describe, it, expect } from "vitest";
import type { Project, Entity } from "@repo/schema";
import {
  speakerUsage,
  sortedEntities,
  speakerOptions,
  duplicateNameIds,
  bodyCounter,
} from "./entities";
import { makeDefaultEntityName, makeEntity } from "./defaults";

describe("pure UI helpers: entities", () => {
  const sampleProject: Project = {
    id: "p1",
    name: "Test",
    nodes: [
      { id: "node_1", type: "start", title: "Start", speakerId: "char_1" },
      { id: "node_2", type: "scene", title: "Scene", speakerId: "char_1" },
      { id: "node_3", type: "end", title: "End", speakerId: "char_2" },
      { id: "node_4", type: "scene", title: "Orphan" },
    ],
    edges: [],
    variables: [],
    entities: [
      { id: "item_sword", kind: "item", name: "Iron Sword" },
      { id: "char_1", kind: "character", name: "Alice" },
      { id: "loc_castle", kind: "location", name: "Castle" },
      { id: "char_2", kind: "character", name: "Alice" }, // duplicate name
      { id: "char_3", kind: "character", name: "Bob" },
      { id: "item_shield", kind: "item", name: "Iron Sword" }, // duplicate item name
    ],
  };

  describe("speakerUsage", () => {
    it("computes entityId -> nodeId[] in O(nodes)", () => {
      const usage = speakerUsage(sampleProject);
      expect(usage.get("char_1")).toEqual(["node_1", "node_2"]);
      expect(usage.get("char_2")).toEqual(["node_3"]);
      expect(usage.get("char_3")).toBeUndefined();
      expect(usage.get("loc_castle")).toBeUndefined();
    });

    it("handles project without entities or nodes", () => {
      const emptyProject: Project = {
        id: "p0",
        name: "Empty",
        nodes: [],
        edges: [],
        variables: [],
      };
      const usage = speakerUsage(emptyProject);
      expect(usage.size).toBe(0);
    });
  });

  describe("sortedEntities", () => {
    it("sorts by kind (character, location, item), then case-insensitive name, then id", () => {
      const sorted = sortedEntities(sampleProject);
      expect(sorted.map((e) => e.id)).toEqual([
        "char_1", // character, Alice, id char_1
        "char_2", // character, Alice, id char_2
        "char_3", // character, Bob
        "loc_castle", // location, Castle
        "item_shield", // item, Iron Sword, id item_shield
        "item_sword", // item, Iron Sword, id item_sword
      ]);
    });

    it("handles project without entities key", () => {
      const proj: Project = { id: "p0", name: "No entities", nodes: [], edges: [], variables: [] };
      expect(sortedEntities(proj)).toEqual([]);
    });
  });

  describe("speakerOptions", () => {
    it("filters characters and disambiguates label by id ONLY when names collide", () => {
      const options = speakerOptions(sampleProject);
      expect(options).toEqual([
        { id: "char_1", name: "Alice", label: "Alice (char_1)" },
        { id: "char_2", name: "Alice", label: "Alice (char_2)" },
        { id: "char_3", name: "Bob", label: "Bob" },
      ]);
    });
  });

  describe("duplicateNameIds", () => {
    it("returns Set of IDs of same-kind entities sharing a name", () => {
      const dupes = duplicateNameIds(sampleProject);
      expect(dupes.has("char_1")).toBe(true);
      expect(dupes.has("char_2")).toBe(true);
      expect(dupes.has("char_3")).toBe(false);
      expect(dupes.has("loc_castle")).toBe(false);
      expect(dupes.has("item_sword")).toBe(true);
      expect(dupes.has("item_shield")).toBe(true);
    });
  });

  describe("bodyCounter", () => {
    it("counts code points correctly", () => {
      const res = bodyCounter("hello world");
      expect(res.count).toBe(11);
      expect(res.max).toBe(20000);
      expect(res.isOverLimit).toBe(false);
      expect(res.overCount).toBe(0);
    });

    it("counts surrogate pairs as 1 code point", () => {
      const emojiString = "😀🎉🚀"; // 3 code points, 6 code units
      const res = bodyCounter(emojiString);
      expect(res.count).toBe(3);
      expect(res.isOverLimit).toBe(false);
    });

    it("detects exactly-at-cap and one-over-cap bodies", () => {
      const atCap = "a".repeat(20000);
      const resAtCap = bodyCounter(atCap);
      expect(resAtCap.count).toBe(20000);
      expect(resAtCap.isOverLimit).toBe(false);
      expect(resAtCap.overCount).toBe(0);

      const overCap = "a".repeat(20001);
      const resOver = bodyCounter(overCap);
      expect(resOver.count).toBe(20001);
      expect(resOver.isOverLimit).toBe(true);
      expect(resOver.overCount).toBe(1);
    });
  });

  describe("makeDefaultEntityName & makeEntity", () => {
    it("generates numbered default names that do not collide", () => {
      const entities: Entity[] = [];

      const name1 = makeDefaultEntityName("character", entities);
      expect(name1).toBe("New character");
      const e1 = makeEntity("character", entities);
      expect(e1).toEqual({ id: "entity_1", kind: "character", name: "New character" });
      entities.push(e1);

      const name2 = makeDefaultEntityName("character", entities);
      expect(name2).toBe("New character 2");
      const e2 = makeEntity("character", entities);
      expect(e2).toEqual({ id: "entity_2", kind: "character", name: "New character 2" });
      entities.push(e2);

      const name3 = makeDefaultEntityName("character", entities);
      expect(name3).toBe("New character 3");

      // Location has separate naming sequence
      const locName = makeDefaultEntityName("location", entities);
      expect(locName).toBe("New location");
      const eLoc = makeEntity("location", entities);
      expect(eLoc).toEqual({ id: "entity_3", kind: "location", name: "New location" });
      entities.push(eLoc);

      const locName2 = makeDefaultEntityName("location", entities);
      expect(locName2).toBe("New location 2");
    });
  });
});
