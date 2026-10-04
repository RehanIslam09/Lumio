import type { Project } from "@repo/schema";
import type { EditorState } from "../editor/index.js";

/**
 * Checks whether the editor state has unsaved modifications relative to the saved baseline.
 * Uses strict reference comparison (`state.present !== saved`).
 */
export function isDirty(state: EditorState, saved: Project): boolean {
  return state.present !== saved;
}
