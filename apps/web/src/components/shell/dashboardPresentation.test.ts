import { describe, it, expect } from "vitest";
import type { ProjectSummaryDto } from "../../api/types.js";
import {
  relativeTime,
  filterAndSort,
} from "./dashboardPresentation.js";

describe("W-043 dashboardPresentation helper: relativeTime (A5)", () => {
  const baseTime = new Date("2026-10-26T12:00:00.000Z").getTime();

  it("clamps future dates and sub-minute elapsed time to 'just now'", () => {
    expect(relativeTime(baseTime, "2026-10-26T12:05:00.000Z")).toBe("just now");
    expect(relativeTime(baseTime, "2026-10-26T12:00:00.000Z")).toBe("just now");
    // 59 seconds ago -> "just now" (boundary test 59s)
    expect(relativeTime(baseTime, new Date(baseTime - 59 * 1000).toISOString())).toBe("just now");
  });

  it("formats minutes at 60s and 59min boundaries", () => {
    // 60 seconds ago -> "1 min ago" (boundary test 60s)
    expect(relativeTime(baseTime, new Date(baseTime - 60 * 1000).toISOString())).toBe("1 min ago");
    expect(relativeTime(baseTime, new Date(baseTime - 120 * 1000).toISOString())).toBe("2 min ago");
    // 59 min 59 sec ago -> "59 min ago" (boundary test 59min)
    expect(
      relativeTime(baseTime, new Date(baseTime - (59 * 60 + 59) * 1000).toISOString()),
    ).toBe("59 min ago");
  });

  it("formats hours at 60min and 23h boundaries", () => {
    // 60 minutes ago -> "1 h ago" (boundary test 60min)
    expect(relativeTime(baseTime, new Date(baseTime - 60 * 60 * 1000).toISOString())).toBe("1 h ago");
    expect(relativeTime(baseTime, new Date(baseTime - 2 * 60 * 60 * 1000).toISOString())).toBe("2 h ago");
    // 23 hours 59 min ago -> "23 h ago" (boundary test 23h)
    expect(
      relativeTime(baseTime, new Date(baseTime - (23 * 3600 + 59 * 60) * 1000).toISOString()),
    ).toBe("23 h ago");
  });

  it("formats yesterday at 24h and 47h boundaries", () => {
    // 24 hours ago -> "yesterday" (boundary test 24h)
    expect(relativeTime(baseTime, new Date(baseTime - 24 * 3600 * 1000).toISOString())).toBe("yesterday");
    // 47 hours 59 min ago -> "yesterday" (boundary test 47h)
    expect(
      relativeTime(baseTime, new Date(baseTime - (47 * 3600 + 59 * 60) * 1000).toISOString()),
    ).toBe("yesterday");
  });

  it("formats days at 48h (2 days) and 6 days boundaries", () => {
    // 48 hours ago -> "2 days ago" (boundary test 48h)
    expect(relativeTime(baseTime, new Date(baseTime - 48 * 3600 * 1000).toISOString())).toBe("2 days ago");
    // 6 days 23 hours ago -> "6 days ago" (boundary test 6d)
    expect(
      relativeTime(baseTime, new Date(baseTime - (6 * 86400 + 23 * 3600) * 1000).toISOString()),
    ).toBe("6 days ago");
  });

  it("formats short date at >= 7 days boundary with UTC timezone and year", () => {
    // 7 days ago -> short date (Oct 19, 2026) (boundary test 7d)
    const sevenDaysAgo = new Date(baseTime - 7 * 86400 * 1000).toISOString();
    expect(relativeTime(baseTime, sevenDaysAgo, "UTC")).toBe("Oct 19, 2026");

    const oldDate = new Date("2024-03-15T10:00:00.000Z").toISOString();
    expect(relativeTime(baseTime, oldDate, "UTC")).toBe("Mar 15, 2024");
  });

  it("handles invalid date strings without throwing", () => {
    expect(relativeTime(baseTime, "not-a-date")).toBe("unknown date");
    expect(relativeTime(baseTime, "")).toBe("unknown date");
  });
});

describe("W-043 dashboardPresentation helper: filterAndSort (A6)", () => {
  const sampleStories: ProjectSummaryDto[] = [
    {
      id: "proj-1",
      name: "The Winds of Change",
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-25T14:00:00.000Z",
      latestVersion: 3,
    },
    {
      id: "proj-2",
      name: "Benchmark Story 100 Nodes",
      createdAt: "2026-10-02T10:00:00.000Z",
      updatedAt: "2026-10-26T11:00:00.000Z",
      latestVersion: 1,
    },
    {
      id: "proj-3",
      name: "Shadows in the Mist",
      createdAt: "2026-10-10T09:00:00.000Z",
      updatedAt: "2026-10-20T08:00:00.000Z",
      latestVersion: 5,
    },
    {
      id: "proj-4",
      name: "Story 10",
      createdAt: "2026-10-05T10:00:00.000Z",
      updatedAt: "2026-10-15T10:00:00.000Z",
      latestVersion: 2,
    },
    {
      id: "proj-5",
      name: "Story 2",
      createdAt: "2026-10-05T10:00:00.000Z",
      updatedAt: "2026-10-16T10:00:00.000Z",
      latestVersion: 2,
    },
  ];

  it("hides benchmark stories by default and reports accurate hidden count", () => {
    const result = filterAndSort(sampleStories, {
      query: "",
      sort: "last-updated",
      showBenchmarks: false,
    });

    expect(result.hiddenBenchmarkCount).toBe(1);
    expect(result.stories.map((s) => s.id)).toEqual(["proj-1", "proj-3", "proj-5", "proj-4"]);
  });

  it("shows benchmark stories when showBenchmarks is true", () => {
    const result = filterAndSort(sampleStories, {
      query: "",
      sort: "last-updated",
      showBenchmarks: true,
    });

    expect(result.hiddenBenchmarkCount).toBe(0);
    expect(result.stories.map((s) => s.id)).toContain("proj-2");
    expect(result.stories[0]?.id).toBe("proj-2"); // Newest updatedAt
  });

  it("performs case-insensitive trimmed query search", () => {
    const result = filterAndSort(sampleStories, {
      query: "  winds  ",
      sort: "last-updated",
      showBenchmarks: false,
    });

    expect(result.stories).toHaveLength(1);
    expect(result.stories[0]?.id).toBe("proj-1");
  });

  it("excludes non-matching benchmark stories from hidden count when query is active", () => {
    const result = filterAndSort(sampleStories, {
      query: "Shadows",
      sort: "last-updated",
      showBenchmarks: false,
    });

    // proj-2 is a benchmark, but doesn't match "Shadows", so hidden count must be 0
    expect(result.hiddenBenchmarkCount).toBe(0);
    expect(result.stories.map((s) => s.id)).toEqual(["proj-3"]);

    const benchQueryResult = filterAndSort(sampleStories, {
      query: "Benchmark",
      sort: "last-updated",
      showBenchmarks: false,
    });
    // proj-2 matches "Benchmark", so hidden count is 1
    expect(benchQueryResult.hiddenBenchmarkCount).toBe(1);
    expect(benchQueryResult.stories).toHaveLength(0);
  });

  it("sorts by name naturally (numeric: true so Story 2 < Story 10)", () => {
    const result = filterAndSort(sampleStories, {
      query: "Story",
      sort: "name",
      showBenchmarks: true,
    });

    expect(result.stories.map((s) => s.name)).toEqual([
      "Benchmark Story 100 Nodes",
      "Story 2",
      "Story 10",
    ]);
  });

  it("sorts by created date descending", () => {
    const result = filterAndSort(sampleStories, {
      query: "",
      sort: "created",
      showBenchmarks: false,
    });

    expect(result.stories.map((s) => s.id)).toEqual(["proj-3", "proj-4", "proj-5", "proj-1"]);
  });
});


