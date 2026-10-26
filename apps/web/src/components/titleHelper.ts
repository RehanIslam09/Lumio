/**
 * Pure title helpers and constants for Lumio project title editing.
 */

/**
 * Universal maximum character length for new project titles across Lumio UI.
 * Stored legacy titles longer than 80 characters remain supported and displayable.
 */
export const TITLE_MAX = 80;

/**
 * Minimum character length before displaying the character counter.
 */
export const TITLE_COUNTER_THRESHOLD = 60;

/**
 * Warning threshold for project title character counter.
 */
export const TITLE_WARNING_THRESHOLD = 72;

export type TitleCounterTone = "neutral" | "warning" | "danger";

export interface TitleCounterState {
  visible: boolean;
  tone: TitleCounterTone;
  count: number;
  max: number;
}

/**
 * Pure helper determining visibility and color tone of the title length counter.
 *
 * Matrix:
 * - length < 60: hidden (visible: false, tone: "neutral")
 * - 60 <= length <= 71: visible, tone: "neutral"
 * - 72 <= length <= 79: visible, tone: "warning"
 * - length >= 80: visible, tone: "danger"
 */
export function titleCounterState(length: number): TitleCounterState {
  const visible = length >= TITLE_COUNTER_THRESHOLD;
  let tone: TitleCounterTone = "neutral";

  if (length >= TITLE_MAX) {
    tone = "danger";
  } else if (length >= TITLE_WARNING_THRESHOLD) {
    tone = "warning";
  }

  return {
    visible,
    tone,
    count: length,
    max: TITLE_MAX,
  };
}

export type TitleCommitResult =
  | { ok: true; title: string }
  | { ok: false; reason: string };

/**
 * Pure validator for committing an edited title.
 *
 * Rules:
 * - Empty / whitespace-only: rejected with "Story title cannot be empty".
 * - Legacy titles longer than TITLE_MAX (80) can be kept unchanged or shortened, but never lengthened.
 * - New titles or existing titles <= 80 cannot exceed TITLE_MAX (80).
 * - Code never silently truncates text.
 */
export function validateTitleCommit(draft: string, original: string): TitleCommitResult {
  const trimmed = draft.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "Story title cannot be empty" };
  }

  const effectiveLimit = Math.max(TITLE_MAX, original.length);
  if (trimmed.length > effectiveLimit) {
    return {
      ok: false,
      reason: `Titles can be up to ${TITLE_MAX} characters`,
    };
  }

  return { ok: true, title: trimmed };
}
