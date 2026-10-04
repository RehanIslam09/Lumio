export type {
  EditorState,
  EditorAction,
  EditorErrorCode,
  EditorError,
  ApplyResult,
} from "./types";

export { structurallyEqual } from "./equal";
export { nextId } from "./id";
export { createEditor, undo, redo, canUndo, canRedo, HISTORY_CAP } from "./history";
export { apply } from "./apply";
