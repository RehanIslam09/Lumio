/**
 * Pure presentation helpers and data structures for Lumio authentication
 * and signed-out product landing experiences.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordRequirementState {
  ok: boolean;
  codePoints: number;
  min: number;
  max: number;
  meetsMin: boolean;
  exceedsMax: boolean;
  reason?: string;
}

/**
 * Pure client-side password requirement validator.
 * Matches server Unicode code point rules: Array.from(password).length between 10 and 128.
 */
export function validatePasswordRequirements(password: string): PasswordRequirementState {
  const codePoints = Array.from(password).length;
  const meetsMin = codePoints >= PASSWORD_MIN_LENGTH;
  const exceedsMax = codePoints > PASSWORD_MAX_LENGTH;
  const ok = meetsMin && !exceedsMax;

  let reason: string | undefined;
  if (!meetsMin) {
    reason = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  } else if (exceedsMax) {
    reason = `Password must not exceed ${PASSWORD_MAX_LENGTH} characters`;
  }

  return {
    ok,
    codePoints,
    min: PASSWORD_MIN_LENGTH,
    max: PASSWORD_MAX_LENGTH,
    meetsMin,
    exceedsMax,
    reason,
  };
}

export interface AuthFeatureItem {
  id: "cloud-save" | "playtest" | "simulate" | "checker";
  title: string;
  description: string;
  iconName: "cloud" | "play" | "activity" | "alert";
}

/**
 * Authoritative feature proof points based strictly on existing Lumio capabilities.
 * Reused across signed-out dashboard and auth showcase panels.
 */
export const AUTH_FEATURES: readonly AuthFeatureItem[] = [
  {
    id: "cloud-save",
    title: "Save to the cloud",
    description: "Every save creates a versioned snapshot you can inspect, download, and restore at any time.",
    iconName: "cloud",
  },
  {
    id: "playtest",
    title: "Playtest your branches",
    description: "Walk through interactive choices, verify dialogue flow, and test variables step by step.",
    iconName: "play",
  },
  {
    id: "simulate",
    title: "Simulate thousands of readers",
    description: "Test thousands of playthroughs in seconds to uncover unreachable endings and measure story coverage.",
    iconName: "activity",
  },
  {
    id: "checker",
    title: "Catch problems early",
    description: "Automated static analysis flags orphan scenes, missing conditions, and broken logic as you write.",
    iconName: "alert",
  },
];

/**
 * Pure deterministic visibility helper for development navigation items.
 * Shows Developer route entry points only when running in development mode.
 */
export function isDevNavVisible(isDevEnv: boolean | undefined): boolean {
  return Boolean(isDevEnv);
}
