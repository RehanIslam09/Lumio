import { describe, it, expect } from "vitest";
import type { Project } from "@repo/schema";
import { compareProjects, computeLineDiff } from "./diff.js";

function makeBaseProject(): Project {
  return {
    id: "proj_test",
    name: "Original Story Title",
    nodes: [
      {
        id: "node_start",
        type: "start",
        title: "The Beginning",
        position: { x: 100, y: 100 },
        body: "Once upon a time in a distant land.\nThe wind blew cold.",
        speakerId: "char_narrator",
      },
      {
        id: "node_tavern",
        type: "scene",
        title: "The Rusty Anchor",
        position: { x: 300, y: 100 },
        body: "The tavern was warm and noisy.",
        speakerId: "char_innkeeper",
      },
      {
        id: "node_end",
        type: "end",
        title: "Journey's End",
        position: { x: 500, y: 100 },
      },
    ],
    edges: [
      {
        id: "edge_1",
        from: "node_start",
        to: "node_tavern",
      },
      {
        id: "edge_2",
        from: "node_tavern",
        to: "node_end",
        condition: "hasGold >= 10",
        effects: ["hasGold = hasGold - 10"],
      },
    ],
    variables: [
      {
        id: "var_gold",
        name: "hasGold",
        type: "number",
        initial: 20,
      },
    ],
    entities: [
      {
        id: "char_narrator",
        kind: "character",
        name: "Narrator",
        description: "The unseen voice",
      },
      {
        id: "char_innkeeper",
        kind: "character",
        name: "Innkeeper Barnaby",
      },
    ],
  };
}

describe("Document Comparison Engine (W-039)", () => {
  describe("computeLineDiff", () => {
    it("returns empty array when both inputs are empty or null", () => {
      expect(computeLineDiff("", "")).toEqual([]);
      expect(computeLineDiff(null, null)).toEqual([]);
      expect(computeLineDiff(undefined, "")).toEqual([]);
    });

    it("marks all lines unchanged when inputs are identical", () => {
      const text = "Line 1\nLine 2\nLine 3";
      const diff = computeLineDiff(text, text);
      expect(diff).toHaveLength(3);
      expect(diff.every((l) => l.type === "unchanged")).toBe(true);
    });

    it("identifies additions, removals, and unchanged lines correctly", () => {
      const textA = "Header\nOld body sentence.\nFooter";
      const textB = "Header\nNew narrative sentence.\nAdded line.\nFooter";

      const diff = computeLineDiff(textA, textB);
      expect(diff).toEqual([
        { type: "unchanged", text: "Header" },
        { type: "removed", text: "Old body sentence." },
        { type: "added", text: "New narrative sentence." },
        { type: "added", text: "Added line." },
        { type: "unchanged", text: "Footer" },
      ]);
    });

    it("handles Unicode, non-Latin text, and emojis safely", () => {
      const textA = "⚔️ 勇気の章\n古いテキスト";
      const textB = "⚔️ 勇気の章\n新しいテキスト\n✨ 光の矢";

      const diff = computeLineDiff(textA, textB);
      expect(diff).toEqual([
        { type: "unchanged", text: "⚔️ 勇気の章" },
        { type: "removed", text: "古いテキスト" },
        { type: "added", text: "新しいテキスト" },
        { type: "added", text: "✨ 光の矢" },
      ]);
    });
  });

  describe("compareProjects", () => {
    it("reports totalChanges = 0 and empty diff lists for identical documents", () => {
      const base = makeBaseProject();
      const diff = compareProjects(base, base);

      expect(diff.summary.totalChanges).toBe(0);
      expect(diff.summary.nameChanged).toBe(false);
      expect(diff.nodes.filter((n) => n.type !== "unchanged")).toHaveLength(0);
      expect(diff.edges.filter((e) => e.type !== "unchanged")).toHaveLength(0);
      expect(diff.entities.filter((e) => e.type !== "unchanged")).toHaveLength(0);
      expect(diff.variables.filter((v) => v.type !== "unchanged")).toHaveLength(0);
    });

    it("detects project title rename", () => {
      const base = makeBaseProject();
      const next = { ...base, name: "Revised Story Title" };
      const diff = compareProjects(base, next);

      expect(diff.projectName.changed).toBe(true);
      expect(diff.projectName.from).toBe("Original Story Title");
      expect(diff.projectName.to).toBe("Revised Story Title");
      expect(diff.summary.nameChanged).toBe(true);
      expect(diff.summary.totalChanges).toBe(1);
    });

    it("detects added, removed, and modified nodes by stable ID", () => {
      const base = makeBaseProject();
      const nodeStart = base.nodes[0];
      const nodeTavern = base.nodes[1];
      if (!nodeStart || !nodeTavern) throw new Error("Missing base nodes");

      const next: Project = {
        ...base,
        nodes: [
          // modified: body and speaker changed
          {
            ...nodeStart,
            body: "A new prologue begins.\nWith altered winds.",
            speakerId: undefined,
          },
          // unchanged: node_tavern kept as is
          nodeTavern,
          // added: new node_dungeon
          {
            id: "node_dungeon",
            type: "scene",
            title: "Dark Dungeon",
            position: { x: 400, y: 200 },
            body: "Dripping water echoes in the shadows.",
          },
          // removed: node_end is omitted from next
        ],
      };

      const diff = compareProjects(base, next);

      expect(diff.summary.nodesAdded).toBe(1);
      expect(diff.summary.nodesRemoved).toBe(1);
      expect(diff.summary.nodesModified).toBe(1);

      const added = diff.nodes.find((n) => n.id === "node_dungeon");
      expect(added?.type).toBe("added");
      expect(added?.title.to).toBe("Dark Dungeon");

      const removed = diff.nodes.find((n) => n.id === "node_end");
      expect(removed?.type).toBe("removed");
      expect(removed?.title.from).toBe("Journey's End");

      const modified = diff.nodes.find((n) => n.id === "node_start");
      expect(modified?.type).toBe("modified");
      expect(modified?.hasNarrativeChange).toBe(true);
      expect(modified?.hasLayoutChange).toBe(false);
      expect(modified?.speakerId.changed).toBe(true);
      expect(modified?.body.changed).toBe(true);
      expect(modified?.body.lines?.some((l) => l.type === "added")).toBe(true);
    });

    it("distinguishes layout-only changes from narrative changes", () => {
      const base = makeBaseProject();
      const [nodeStart, nodeTavern, nodeEnd] = base.nodes;
      if (!nodeStart || !nodeTavern || !nodeEnd) throw new Error("Missing base nodes");

      const next: Project = {
        ...base,
        nodes: [
          // position only changed
          {
            ...nodeStart,
            position: { x: 150, y: 250 },
          },
          nodeTavern,
          nodeEnd,
        ],
      };

      const diff = compareProjects(base, next);
      const modNode = diff.nodes.find((n) => n.id === "node_start");

      expect(modNode?.type).toBe("modified");
      expect(modNode?.hasLayoutChange).toBe(true);
      expect(modNode?.hasNarrativeChange).toBe(false);
      expect(diff.summary.layoutChanges).toBe(1);
      expect(diff.summary.narrativeChanges).toBe(0);
    });

    it("detects edge additions, removals, endpoint moves, and condition/effect edits", () => {
      const base = makeBaseProject();
      const edge1 = base.edges[0];
      if (!edge1) throw new Error("Missing base edge");

      const next: Project = {
        ...base,
        edges: [
          // edge_1 modified: condition added
          {
            ...edge1,
            condition: "isNight == true",
          },
          // edge_2 removed
          // edge_3 added
          {
            id: "edge_3",
            from: "node_start",
            to: "node_end",
          },
        ],
      };

      const diff = compareProjects(base, next);

      expect(diff.summary.edgesAdded).toBe(1);
      expect(diff.summary.edgesRemoved).toBe(1);
      expect(diff.summary.edgesModified).toBe(1);

      const modEdge = diff.edges.find((e) => e.id === "edge_1");
      expect(modEdge?.type).toBe("modified");
      expect(modEdge?.condition.changed).toBe(true);
      expect(modEdge?.condition.to).toBe("isNight == true");

      const remEdge = diff.edges.find((e) => e.id === "edge_2");
      expect(remEdge?.type).toBe("removed");

      const addEdge = diff.edges.find((e) => e.id === "edge_3");
      expect(addEdge?.type).toBe("added");
    });

    it("detects entity and variable changes", () => {
      const base = makeBaseProject();
      const ent0 = base.entities?.[0];
      if (!ent0) throw new Error("Missing base entity");

      const next: Project = {
        ...base,
        variables: [
          {
            id: "var_gold",
            name: "goldCoins", // renamed
            type: "number",
            initial: 50, // initial changed
          },
        ],
        entities: [
          ent0,
          // char_innkeeper modified: name and description
          {
            id: "char_innkeeper",
            kind: "character",
            name: "Barnaby the Jolly",
            description: "Owner of the Rusty Anchor",
          },
        ],
      };

      const diff = compareProjects(base, next);

      const varDiff = diff.variables.find((v) => v.id === "var_gold");
      expect(varDiff?.type).toBe("modified");
      expect(varDiff?.name.changed).toBe(true);
      expect(varDiff?.name.to).toBe("goldCoins");
      expect(varDiff?.initial.changed).toBe(true);

      const entDiff = diff.entities.find((e) => e.id === "char_innkeeper");
      expect(entDiff?.type).toBe("modified");
      expect(entDiff?.name.to).toBe("Barnaby the Jolly");
      expect(entDiff?.description.changed).toBe(true);
    });

    it("is deterministic regardless of the order of nodes or entities in the array", () => {
      const base = makeBaseProject();
      const [n0, n1, n2] = base.nodes;
      if (!n0 || !n1 || !n2) throw new Error("Missing base nodes");

      const nextShuffled: Project = {
        ...base,
        nodes: [n2, n0, n1],
      };

      const diff = compareProjects(base, nextShuffled);
      expect(diff.summary.totalChanges).toBe(0);
      expect(diff.nodes.filter((n) => n.type !== "unchanged")).toHaveLength(0);
    });
  });
});
