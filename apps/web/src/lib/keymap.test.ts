import { describe, it, expect } from "vitest";
import { interpretKey, isTargetEditable } from "./keymap";

describe("interpretKey", () => {
  describe("editable targets", () => {
    it("always returns null when targetIsEditable is true", () => {
      // Undo
      expect(
        interpretKey({
          key: "z",
          ctrlKey: true,
          metaKey: false,
          shiftKey: false,
          targetIsEditable: true,
        }),
      ).toBeNull();

      // Redo (Ctrl+Y)
      expect(
        interpretKey({
          key: "y",
          ctrlKey: true,
          metaKey: false,
          shiftKey: false,
          targetIsEditable: true,
        }),
      ).toBeNull();

      // Redo (Ctrl+Shift+Z)
      expect(
        interpretKey({
          key: "Z",
          ctrlKey: true,
          metaKey: false,
          shiftKey: true,
          targetIsEditable: true,
        }),
      ).toBeNull();

      // Delete
      expect(
        interpretKey({
          key: "Delete",
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          targetIsEditable: true,
        }),
      ).toBeNull();

      // Backspace
      expect(
        interpretKey({
          key: "Backspace",
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          targetIsEditable: true,
        }),
      ).toBeNull();
    });
  });

  describe("non-editable targets", () => {
    it("identifies undo with Ctrl+Z or Cmd+Z", () => {
      expect(
        interpretKey({
          key: "z",
          ctrlKey: true,
          metaKey: false,
          shiftKey: false,
          targetIsEditable: false,
        }),
      ).toBe("undo");

      expect(
        interpretKey({
          key: "Z",
          ctrlKey: false,
          metaKey: true,
          shiftKey: false,
          targetIsEditable: false,
        }),
      ).toBe("undo");
    });

    it("identifies redo with Ctrl+Shift+Z or Cmd+Shift+Z or Ctrl+Y or Cmd+Y", () => {
      expect(
        interpretKey({
          key: "Z",
          ctrlKey: true,
          metaKey: false,
          shiftKey: true,
          targetIsEditable: false,
        }),
      ).toBe("redo");

      expect(
        interpretKey({
          key: "z",
          ctrlKey: false,
          metaKey: true,
          shiftKey: true,
          targetIsEditable: false,
        }),
      ).toBe("redo");

      expect(
        interpretKey({
          key: "y",
          ctrlKey: true,
          metaKey: false,
          shiftKey: false,
          targetIsEditable: false,
        }),
      ).toBe("redo");

      expect(
        interpretKey({
          key: "Y",
          ctrlKey: false,
          metaKey: true,
          shiftKey: false,
          targetIsEditable: false,
        }),
      ).toBe("redo");
    });

    it("identifies delete with Delete or Backspace (no modifiers)", () => {
      expect(
        interpretKey({
          key: "Delete",
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          targetIsEditable: false,
        }),
      ).toBe("delete");

      expect(
        interpretKey({
          key: "Backspace",
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          targetIsEditable: false,
        }),
      ).toBe("delete");
    });

    it("returns null for Delete or Backspace if modifier is pressed", () => {
      expect(
        interpretKey({
          key: "Delete",
          ctrlKey: true,
          metaKey: false,
          shiftKey: false,
          targetIsEditable: false,
        }),
      ).toBeNull();

      expect(
        interpretKey({
          key: "Backspace",
          ctrlKey: false,
          metaKey: true,
          shiftKey: false,
          targetIsEditable: false,
        }),
      ).toBeNull();
    });

    it("returns null for other keys", () => {
      expect(
        interpretKey({
          key: "a",
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          targetIsEditable: false,
        }),
      ).toBeNull();

      expect(
        interpretKey({
          key: "Enter",
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          targetIsEditable: false,
        }),
      ).toBeNull();
    });
  });

  describe("isTargetEditable", () => {
    it("returns true for INPUT, TEXTAREA, and SELECT elements", () => {
      expect(isTargetEditable({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
      expect(isTargetEditable({ tagName: "input" } as unknown as EventTarget)).toBe(true);
      expect(isTargetEditable({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
      expect(isTargetEditable({ tagName: "textarea" } as unknown as EventTarget)).toBe(true);
      expect(isTargetEditable({ tagName: "SELECT" } as unknown as EventTarget)).toBe(true);
      expect(isTargetEditable({ tagName: "select" } as unknown as EventTarget)).toBe(true);
    });

    it("returns true for elements with isContentEditable or contenteditable attribute", () => {
      expect(isTargetEditable({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
      expect(
        isTargetEditable({
          tagName: "DIV",
          hasAttribute: (attr: string) => attr === "contenteditable",
        } as unknown as EventTarget),
      ).toBe(true);
    });

    it("returns false for non-editable targets, null, or canvas elements", () => {
      expect(isTargetEditable(null)).toBe(false);
      expect(isTargetEditable({ tagName: "DIV" } as unknown as EventTarget)).toBe(false);
      expect(isTargetEditable({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
      expect(isTargetEditable({ tagName: "BODY" } as unknown as EventTarget)).toBe(false);
    });
  });
});
