import { describe, it, expect } from "vitest";
import {
  TITLE_MAX,
  TITLE_COUNTER_THRESHOLD,
  TITLE_WARNING_THRESHOLD,
  titleCounterState,
  validateTitleCommit,
} from "./titleHelper.js";

describe("titleHelper pure module (W-046)", () => {
  describe("1. Constants", () => {
    it("exports TITLE_MAX = 80", () => {
      expect(TITLE_MAX).toBe(80);
      expect(TITLE_COUNTER_THRESHOLD).toBe(60);
      expect(TITLE_WARNING_THRESHOLD).toBe(72);
    });
  });

  describe("2. titleCounterState exact values (A3)", () => {
    it("hides counter below 60 characters (59)", () => {
      const state = titleCounterState(59);
      expect(state.visible).toBe(false);
      expect(state.tone).toBe("neutral");
      expect(state.count).toBe(59);
      expect(state.max).toBe(80);
    });

    it("shows neutral counter at boundary 60", () => {
      const state = titleCounterState(60);
      expect(state.visible).toBe(true);
      expect(state.tone).toBe("neutral");
      expect(state.count).toBe(60);
    });

    it("shows neutral counter at upper boundary 71", () => {
      const state = titleCounterState(71);
      expect(state.visible).toBe(true);
      expect(state.tone).toBe("neutral");
      expect(state.count).toBe(71);
    });

    it("shows warning counter at boundary 72", () => {
      const state = titleCounterState(72);
      expect(state.visible).toBe(true);
      expect(state.tone).toBe("warning");
      expect(state.count).toBe(72);
    });

    it("shows warning counter at upper boundary 79", () => {
      const state = titleCounterState(79);
      expect(state.visible).toBe(true);
      expect(state.tone).toBe("warning");
      expect(state.count).toBe(79);
    });

    it("shows danger counter at exact cap 80", () => {
      const state = titleCounterState(80);
      expect(state.visible).toBe(true);
      expect(state.tone).toBe("danger");
      expect(state.count).toBe(80);
    });

    it("shows danger counter exceeding cap (81)", () => {
      const state = titleCounterState(81);
      expect(state.visible).toBe(true);
      expect(state.tone).toBe("danger");
      expect(state.count).toBe(81);
    });

    it("shows danger counter for legacy long title (100)", () => {
      const state = titleCounterState(100);
      expect(state.visible).toBe(true);
      expect(state.tone).toBe("danger");
      expect(state.count).toBe(100);
    });
  });

  describe("3. validateTitleCommit rule (A3)", () => {
    it("rejects empty draft", () => {
      const res = validateTitleCommit("", "Original Story");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe("Story title cannot be empty");
      }
    });

    it("rejects whitespace-only draft", () => {
      const res = validateTitleCommit("   \t  \n ", "Original Story");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe("Story title cannot be empty");
      }
    });

    it("accepts new title at exact cap 80 characters", () => {
      const title80 = "A".repeat(80);
      const res = validateTitleCommit(title80, "Short Title");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.title).toBe(title80);
        expect(res.title.length).toBe(80);
      }
    });

    it("rejects new title exceeding cap at 81 characters", () => {
      const title81 = "A".repeat(81);
      const res = validateTitleCommit(title81, "Short Title");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe("Titles can be up to 80 characters");
      }
    });

    it("accepts legacy title longer than 80 unchanged (100 characters)", () => {
      const legacy100 = "L".repeat(100);
      const res = validateTitleCommit(legacy100, legacy100);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.title).toBe(legacy100);
        expect(res.title.length).toBe(100);
      }
    });

    it("accepts legacy title shortened from 100 to 90 characters", () => {
      const legacy100 = "L".repeat(100);
      const shortened90 = "L".repeat(90);
      const res = validateTitleCommit(shortened90, legacy100);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.title).toBe(shortened90);
        expect(res.title.length).toBe(90);
      }
    });

    it("rejects legacy title lengthened from 100 to 101 characters", () => {
      const legacy100 = "L".repeat(100);
      const lengthened101 = "L".repeat(101);
      const res = validateTitleCommit(lengthened101, legacy100);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe("Titles can be up to 80 characters");
      }
    });

    it("never silently truncates stored or committed text", () => {
      const normal = "  Act I: Whispers in the Dark  ";
      const res = validateTitleCommit(normal, "Old Title");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.title).toBe("Act I: Whispers in the Dark");
      }
    });
  });
});
