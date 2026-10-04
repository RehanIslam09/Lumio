import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Variable } from "@repo/schema";
import { checkConditionDraft, checkEffectDraft } from "./draftCheck";

describe("draftCheck", () => {
  const vars: Variable[] = [
    { id: "var_1", name: "gold", type: "number", initial: 10 },
    { id: "var_2", name: "flag", type: "boolean", initial: true },
    { id: "var_3", name: "name", type: "string", initial: "Hero" },
  ];

  describe("checkConditionDraft", () => {
    it("returns empty for blank or whitespace-only source", () => {
      expect(checkConditionDraft("", vars)).toEqual({ status: "empty", problems: [] });
      expect(checkConditionDraft("   \n\t ", vars)).toEqual({ status: "empty", problems: [] });
    });

    it("returns ok for valid condition", () => {
      const res = checkConditionDraft("gold > 5 && flag", vars);
      expect(res.status).toBe("ok");
      expect(res.problems).toEqual([]);
    });

    it("identifies syntax errors", () => {
      const res = checkConditionDraft("gold >", vars);
      expect(res.status).toBe("error");
      expect(res.problems).toHaveLength(1);
      expect(res.problems[0]?.kind).toBe("syntax");
      expect(res.problems[0]?.start).toBeGreaterThanOrEqual(0);
      expect(res.problems[0]?.end).toBeLessThanOrEqual("gold >".length);
    });

    it("identifies undefined-variable errors", () => {
      const res = checkConditionDraft("unknown_var > 0", vars);
      expect(res.status).toBe("error");
      expect(res.problems.some((p) => p.kind === "undefined-variable")).toBe(true);
    });

    it("identifies type-mismatch errors", () => {
      const res = checkConditionDraft("gold + 5", vars); // not boolean
      expect(res.status).toBe("error");
      expect(res.problems.some((p) => p.kind === "type-mismatch")).toBe(true);
    });

    it("clamps spans to source length", () => {
      const res = checkConditionDraft("gold > 5 ||", vars);
      for (const p of res.problems) {
        expect(p.start).toBeGreaterThanOrEqual(0);
        expect(p.end).toBeLessThanOrEqual("gold > 5 ||".length);
        expect(p.start).toBeLessThanOrEqual(p.end);
      }
    });
  });

  describe("checkEffectDraft", () => {
    it("returns empty for blank or whitespace-only source", () => {
      expect(checkEffectDraft("", vars)).toEqual({ status: "empty", problems: [] });
      expect(checkEffectDraft("   \n ", vars)).toEqual({ status: "empty", problems: [] });
    });

    it("returns ok for valid effect", () => {
      const res = checkEffectDraft("gold += 10", vars);
      expect(res.status).toBe("ok");
      expect(res.problems).toEqual([]);
    });

    it("identifies syntax error in effect", () => {
      const res = checkEffectDraft("gold ==", vars);
      expect(res.status).toBe("error");
      expect(res.problems[0]?.kind).toBe("syntax");
    });

    it("identifies undefined-variable in effect target or value", () => {
      const res = checkEffectDraft("unknown_var = 1", vars);
      expect(res.status).toBe("error");
      expect(res.problems.some((p) => p.kind === "undefined-variable")).toBe(true);
    });

    it("identifies type-mismatch in effect assignment", () => {
      const res = checkEffectDraft("gold = true", vars);
      expect(res.status).toBe("error");
      expect(res.problems.some((p) => p.kind === "type-mismatch")).toBe(true);
    });
  });

  describe("fast-check property robustness", () => {
    it("never throws and spans are strictly bounded within [0, source.length]", () => {
      fc.assert(
        fc.property(fc.string(), (source) => {
          const condRes = checkConditionDraft(source, vars);
          expect(["empty", "ok", "error"]).toContain(condRes.status);
          for (const p of condRes.problems) {
            expect(p.start).toBeGreaterThanOrEqual(0);
            expect(p.end).toBeLessThanOrEqual(source.length);
            expect(p.start).toBeLessThanOrEqual(p.end);
          }

          const fxRes = checkEffectDraft(source, vars);
          expect(["empty", "ok", "error"]).toContain(fxRes.status);
          for (const p of fxRes.problems) {
            expect(p.start).toBeGreaterThanOrEqual(0);
            expect(p.end).toBeLessThanOrEqual(source.length);
            expect(p.start).toBeLessThanOrEqual(p.end);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
