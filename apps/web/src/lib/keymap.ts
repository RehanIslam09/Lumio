export interface KeymapInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
  targetIsEditable: boolean;
}

export type KeymapAction = "undo" | "redo" | "delete" | null;

/**
 * Checks if a DOM event target is an editable input or contenteditable element.
 */
export function isTargetEditable(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    hasAttribute?: (name: string) => boolean;
  };

  const tagName = el.tagName?.toUpperCase();
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  if (el.isContentEditable) {
    return true;
  }

  if (typeof el.hasAttribute === "function" && el.hasAttribute("contenteditable")) {
    return true;
  }

  return false;
}

/**
 * Interprets a keyboard event into an editor action.
 * Always returns null when targetIsEditable is true so native browser behavior is preserved.
 */
export function interpretKey(input: KeymapInput): KeymapAction {
  if (input.targetIsEditable) {
    return null;
  }

  const { key, ctrlKey, metaKey, shiftKey, altKey = false } = input;
  const isModifier = ctrlKey || metaKey;

  // Delete / Backspace without modifiers
  if (!isModifier && !altKey && (key === "Delete" || key === "Backspace")) {
    return "delete";
  }

  // Redo: Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y
  if (isModifier && !altKey) {
    const lower = key.toLowerCase();
    if (shiftKey && lower === "z") {
      return "redo";
    }
    if (!shiftKey && lower === "y") {
      return "redo";
    }
    if (!shiftKey && lower === "z") {
      return "undo";
    }
  }

  return null;
}
