import type { Project } from "@repo/schema";
import type { EditorState } from "./types";

export const HISTORY_CAP = 100;

export function createEditor(project: Project): EditorState {
  return {
    present: project,
    past: [],
    future: [],
  };
}

export function canUndo(state: EditorState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: EditorState): boolean {
  return state.future.length > 0;
}

export function undo(state: EditorState): EditorState {
  if (state.past.length === 0) {
    return state;
  }

  const previous = state.past[state.past.length - 1];
  if (!previous) {
    return state;
  }
  const newPast = state.past.slice(0, -1);

  return {
    present: previous,
    past: newPast,
    future: [state.present, ...state.future],
  };
}

export function redo(state: EditorState): EditorState {
  if (state.future.length === 0) {
    return state;
  }

  const next = state.future[0];
  if (!next) {
    return state;
  }
  const newFuture = state.future.slice(1);
  const newPast = [...state.past, state.present];
  if (newPast.length > HISTORY_CAP) {
    newPast.shift();
  }

  return {
    present: next,
    past: newPast,
    future: newFuture,
  };
}
