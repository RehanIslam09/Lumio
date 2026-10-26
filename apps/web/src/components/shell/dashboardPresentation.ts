import type { ProjectSummaryDto } from "../../api/types.js";

export type SortOption = "last-updated" | "created" | "name";

export interface FilterAndSortOptions {
  readonly query: string;
  readonly sort: SortOption;
  readonly showBenchmarks: boolean;
}

export interface FilterAndSortResult {
  readonly stories: readonly ProjectSummaryDto[];
  readonly hiddenBenchmarkCount: number;
}



/**
 * Pure relative time formatter conforming strictly to Amendment A5.
 *
 * Boundary rules:
 * - < 60s (and any future date) -> "just now"
 * - 1..59 min -> "1 min ago" | "N min ago"
 * - 1..23 h -> "1 h ago" | "N h ago"
 * - 24..47 h -> "yesterday"
 * - 2..6 days -> "N days ago"
 * - >= 7 days -> short date e.g. "Oct 7, 2026" (en-US, with year)
 *
 * @param now Reference timestamp in ms or Date object (injected, no Date.now() inside).
 * @param dateInput ISO date string to format.
 * @param timeZone Optional IANA time zone (e.g. "UTC") for the short date.
 */
export function relativeTime(
  now: number | Date,
  dateInput: string,
  timeZone?: string,
): string {
  if (!dateInput || typeof dateInput !== "string") {
    return "unknown date";
  }

  const targetDate = new Date(dateInput);
  const targetMs = targetDate.getTime();
  if (Number.isNaN(targetMs)) {
    return "unknown date";
  }

  const nowMs = typeof now === "number" ? now : now.getTime();
  const elapsedMs = nowMs - targetMs;

  // Future dates and sub-minute elapsed time clamp to "just now"
  if (elapsedMs < 60 * 1000) {
    return "just now";
  }

  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  if (elapsedMinutes < 60) {
    return elapsedMinutes === 1 ? "1 min ago" : `${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return elapsedHours === 1 ? "1 h ago" : `${elapsedHours} h ago`;
  }

  if (elapsedHours < 48) {
    return "yesterday";
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    return `${elapsedDays} days ago`;
  }

  // >= 7 days: formatted short date (e.g. "Oct 7, 2026")
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });

  return formatter.format(targetDate);
}

/**
 * Heuristic to detect benchmark stories generated for performance testing.
 * Strictly labeled as a heuristic in code, docs, and UI.
 */
export function isBenchmarkStory(name: string): boolean {
  return name.trim().toLowerCase().startsWith("benchmark story");
}

/**
 * Filter and sort stories with stable sorting, case-insensitive substring search,
 * and benchmark story filtering.
 */
export function filterAndSort(
  stories: readonly ProjectSummaryDto[],
  options: FilterAndSortOptions,
): FilterAndSortResult {
  const trimmedQuery = options.query.trim().toLowerCase();

  let hiddenBenchmarkCount = 0;
  const filtered: ProjectSummaryDto[] = [];

  for (const story of stories) {
    // 1. Search query filter (case-insensitive substring on name)
    const matchesQuery =
      trimmedQuery.length === 0 || story.name.toLowerCase().includes(trimmedQuery);

    if (!matchesQuery) {
      continue;
    }

    const isBench = isBenchmarkStory(story.name);
    if (isBench && !options.showBenchmarks) {
      hiddenBenchmarkCount += 1;
      continue;
    }

    filtered.push(story);
  }

  // 2. Stable sorting
  filtered.sort((a, b) => {
    if (options.sort === "name") {
      const cmp = a.name.localeCompare(b.name, "en", {
        sensitivity: "base",
        numeric: true,
      });
      if (cmp !== 0) return cmp;
      const dateCmp = b.updatedAt.localeCompare(a.updatedAt);
      if (dateCmp !== 0) return dateCmp;
      return a.id.localeCompare(b.id);
    }

    if (options.sort === "created") {
      const dateCmp = b.createdAt.localeCompare(a.createdAt);
      if (dateCmp !== 0) return dateCmp;
      return a.id.localeCompare(b.id);
    }

    // Default: "last-updated"
    const dateCmp = b.updatedAt.localeCompare(a.updatedAt);
    if (dateCmp !== 0) return dateCmp;
    return a.id.localeCompare(b.id);
  });

  return {
    stories: filtered,
    hiddenBenchmarkCount,
  };
}


