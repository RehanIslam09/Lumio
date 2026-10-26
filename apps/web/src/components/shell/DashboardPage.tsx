import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "../../router/Link.js";
import { navigate } from "../../router/router.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { getApiBaseUrl } from "../../api/config.js";
import type { ProjectSummaryDto } from "../../api/types.js";
import { runCloudDelete, runCloudList } from "../../cloud/outcomes.js";
import {
  CURRENT_SCHEMA_VERSION,
  makeEmptyProject,
} from "../../persistence/index.js";
import { CreateStoryDialog } from "./CreateStoryDialog.js";
import { DeleteStoryDialog } from "./DeleteStoryDialog.js";
import {
  relativeTime,
  filterAndSort,
  type SortOption,
} from "./dashboardPresentation.js";
import { StoryThumbnailView } from "./StoryThumbnailView.js";
import {
  createPreviewLoader,
  type PreviewLoader,
} from "./storyThumbnailLoader.js";
import { fetchProjectThumbnailDocument } from "./projectThumbnailClient.js";
import { SignedOutDashboard } from "./SignedOutDashboard.js";

export interface DashboardPageProps {
  readonly client?: ApiClient;
  readonly onOpenProject?: (projectId: string) => void;
  readonly initialProjects?: ProjectSummaryDto[];
  readonly initialIsUnauthenticated?: boolean;
  readonly initialErrorMessage?: string | null;
  readonly skipAutoFetch?: boolean;
  readonly previewLoader?: PreviewLoader;
}

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ==========================================================================
   SVG Icons (16px, stroke 1.5, currentColor)
   ========================================================================== */

const IconGrid: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </svg>
);

const IconList: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="2" y1="4" x2="14" y2="4" />
    <line x1="2" y1="8" x2="14" y2="8" />
    <line x1="2" y1="12" x2="14" y2="12" />
  </svg>
);

const IconSearch: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="7" cy="7" r="4.5" />
    <line x1="10.5" y1="10.5" x2="14" y2="14" />
  </svg>
);

const IconClear: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="4" y1="4" x2="12" y2="12" />
    <line x1="12" y1="4" x2="4" y2="12" />
  </svg>
);

const IconPlus: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="8" y1="3" x2="8" y2="13" />
    <line x1="3" y1="8" x2="13" y2="8" />
  </svg>
);

const IconMoreVertical: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="3.5" r="1" fill="currentColor" />
    <circle cx="8" cy="8" r="1" fill="currentColor" />
    <circle cx="8" cy="12.5" r="1" fill="currentColor" />
  </svg>
);

const IconCopy: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="5" width="8" height="8" rx="1.5" />
    <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" />
  </svg>
);

const IconTrash: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 4.5h11" />
    <path d="M5.5 4.5V3a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v1.5" />
    <path d="M4 4.5l.8 9a1.5 1.5 0 0 0 1.5 1.4h3.4a1.5 1.5 0 0 0 1.5-1.4l.8-9" />
  </svg>
);

const IconArrowRight: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 8h9" />
    <path d="M8.5 4l4 4-4 4" />
  </svg>
);

const IconSparkles: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 1v3M8 12v3M1 8h3M12 8h3M3.05 3.05l2.12 2.12M10.83 10.83l2.12 2.12M3.05 12.95l2.12-2.12M10.83 5.17l2.12-2.12" />
  </svg>
);

/* ==========================================================================
   Main Dashboard Page Component (W-044)
   ========================================================================== */

export const DashboardPage: React.FC<DashboardPageProps> = ({
  client: injectedClient,
  onOpenProject,
  initialProjects,
  initialIsUnauthenticated = false,
  initialErrorMessage = null,
  skipAutoFetch = false,
  previewLoader: injectedPreviewLoader,
}) => {
  const client = useMemo(() => {
    return injectedClient ?? createApiClient({ baseUrl: getApiBaseUrl() });
  }, [injectedClient]);

  const defaultPreviewLoader = useMemo(() => {
    return createPreviewLoader({
      fetchDocument: async (id, signal) => {
        const baseUrl = getApiBaseUrl();
        const res = await fetchProjectThumbnailDocument({
          baseUrl,
          projectId: id,
          signal,
        });
        if (!res.ok) {
          if (res.kind === "aborted") {
            return { ok: false, kind: "aborted", message: "aborted" };
          }
          return { ok: false, kind: "error", message: res.message };
        }
        return {
          ok: true,
          schemaVersion: res.data.version.schemaVersion,
          rawDocument: res.data.document,
        };
      },
      concurrency: 2,
      cacheSize: 50,
    });
  }, []);

  const previewLoader = injectedPreviewLoader ?? defaultPreviewLoader;

  const [projects, setProjects] = useState<ProjectSummaryDto[]>(initialProjects ?? []);
  const [loading, setLoading] = useState<boolean>(!skipAutoFetch && initialProjects === undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage);
  const [isUnauthenticated, setIsUnauthenticated] = useState<boolean>(initialIsUnauthenticated);

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummaryDto | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  // In-memory view and filter preferences
  const [query, setQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("last-updated");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showBenchmarks, setShowBenchmarks] = useState(false);

  // Accessibility and menu states
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Refs for accessible focus management
  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const lastDeleteTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Injected current time reference for relative time calculation
  const [currentTime] = useState<number>(() => Date.now());

  // Data fetching
  useEffect(() => {
    if (skipAutoFetch) return;
    let active = true;

    async function fetchDashboardData() {
      try {
        const listOutcome = await runCloudList({ client });
        if (!active) return;

        if (listOutcome.kind === "listed") {
          setProjects(listOutcome.projects);
        } else if (listOutcome.kind === "unauthenticated") {
          setIsUnauthenticated(true);
        } else if (listOutcome.kind === "network") {
          setErrorMessage("Network error: Unable to connect to server. Please check your connection.");
        } else if (listOutcome.kind === "timeout") {
          setErrorMessage("Request timed out. Please try again.");
        } else if (listOutcome.kind === "error") {
          setErrorMessage(listOutcome.message);
        } else {
          setErrorMessage("Failed to load project list.");
        }
      } catch {
        if (!active) return;
        setErrorMessage("An unexpected error occurred while loading projects.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void fetchDashboardData();

    return () => {
      active = false;
    };
  }, [client, skipAutoFetch, reloadCounter]);

  // Click-outside listener for card menus
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (activeMenuId && (!(e.target instanceof HTMLElement) || !e.target.closest(".dash-overflow-wrap"))) {
        setActiveMenuId(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeMenuId]);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setErrorMessage(null);
    setIsUnauthenticated(false);
    setReloadCounter((c) => c + 1);
  }, []);

  const handleOpenProject = useCallback((projectId: string) => {
    if (onOpenProject) {
      onOpenProject(projectId);
    } else {
      navigate(`/projects/${encodeURIComponent(projectId)}`);
    }
  }, [onOpenProject]);

  const handleCreateStory = async (
    title: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    const newId = generateUUID();
    const document = makeEmptyProject(newId, title);

    const res = await client.createProject({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      document,
    });

    if (res.ok) {
      const serverAssignedId = res.data.project.id;
      setCreateDialogOpen(false);
      handleOpenProject(serverAssignedId);
      return { ok: true };
    }

    if (res.code === "rate-limited") {
      const secs = res.retryAfterSeconds;
      return {
        ok: false,
        error: secs
          ? `Too many requests. Please wait ${secs}s before creating another story.`
          : "Too many requests. Please slow down.",
      };
    }
    if (res.code === "project-limit-reached") {
      return {
        ok: false,
        error: "Project limit reached. Please remove an existing project to create a new one.",
      };
    }
    if (res.code === "unauthenticated") {
      setIsUnauthenticated(true);
      return { ok: false, error: "Your session has expired. Please sign in again." };
    }

    return { ok: false, error: res.message || "Failed to create project on server." };
  };

  const handleConfirmDelete = async (
    target: ProjectSummaryDto,
  ): Promise<{ ok: boolean; error?: string }> => {
    const outcome = await runCloudDelete({ client, projectId: target.id });

    if (outcome.kind === "deleted" || outcome.kind === "not-found") {
      setProjects((prev) => prev.filter((p) => p.id !== target.id));
      setDeleteTarget(null);
      setActiveMenuId(null);
      setLiveAnnouncement("Story deleted");

      // Focus management: move focus to page h1 after deletion
      setTimeout(() => {
        pageHeadingRef.current?.focus();
      }, 50);

      return { ok: true };
    }

    if (outcome.kind === "unauthenticated") {
      setIsUnauthenticated(true);
      return { ok: false, error: "Your session has expired. Please sign in again." };
    }

    if (outcome.kind === "network") {
      return { ok: false, error: "Network error: Unable to connect to server." };
    }
    if (outcome.kind === "timeout") {
      return { ok: false, error: "Request timed out. Please try again." };
    }

    return { ok: false, error: outcome.message || "Failed to delete story." };
  };

  const handleCopyId = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
      } else {
        // Fallback for environments lacking clipboard API
        const input = document.createElement("input");
        input.value = id;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopiedId(id);
      setLiveAnnouncement("Story ID copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setLiveAnnouncement(`Story ID: ${id}`);
    }
  };

  // Filtered and sorted stories calculation
  const { stories: visibleStories, hiddenBenchmarkCount } = useMemo(() => {
    return filterAndSort(projects, {
      query,
      sort: sortOption,
      showBenchmarks,
    });
  }, [projects, query, sortOption, showBenchmarks]);

  // Resume card selection (A8: most recently updated story when query is empty and sort is last-updated)
  const resumeStory = useMemo(() => {
    if (query.trim().length > 0 || sortOption !== "last-updated" || visibleStories.length === 0) {
      return null;
    }
    return visibleStories[0] ?? null;
  }, [query, sortOption, visibleStories]);

  // Derive relative time of most recently edited story overall
  const latestRelativeTime = useMemo(() => {
    if (projects.length === 0) return "";
    let latest = projects[0]?.updatedAt ?? "";
    for (const p of projects) {
      if (p.updatedAt.localeCompare(latest) > 0) {
        latest = p.updatedAt;
      }
    }
    return relativeTime(currentTime, latest);
  }, [projects, currentTime]);

  return (
    <div className="dash-shell">
      {/* Main Dashboard Content */}
      <main className="dash-main" id="main-content">
        <div className="dash-content-container">
          {/* Accessible Live Region */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {liveAnnouncement}
          </div>

          {!loading && isUnauthenticated ? (
            <SignedOutDashboard />
          ) : (
            <>
              {/* Page Header */}
              <section className="dash-page-header" aria-labelledby="dashboard-heading">
                <div className="dash-header-text">
                  <h1
                    id="dashboard-heading"
                    ref={pageHeadingRef}
                    tabIndex={-1}
                    className="dash-page-title"
                  >
                    Your stories
                  </h1>
                  <p className="dash-page-subtitle">
                    {projects.length} {projects.length === 1 ? "story" : "stories"}
                    {latestRelativeTime && ` · last edited ${latestRelativeTime}`}
                  </p>
                </div>

                <div className="dash-header-actions">
                  <button
                    type="button"
                    className="dash-btn-primary"
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    <IconPlus />
                    <span>New story</span>
                  </button>
                </div>
              </section>

              {/* Resume Card (A8) */}
              {resumeStory && !loading && !errorMessage && !isUnauthenticated && (
                <section className="dash-resume-section" aria-label="Continue working">
                  <article className="dash-resume-card">
                    <div className="dash-resume-glyph">
                      <StoryThumbnailView
                        projectId={resumeStory.id}
                        latestVersion={resumeStory.latestVersion}
                        loader={previewLoader}
                        variant="resume"
                      />
                    </div>
                    <div className="dash-resume-info">
                      <div className="dash-resume-eyebrow">
                        <IconSparkles />
                        <span>Continue where you left off</span>
                      </div>
                      <h2 className="dash-resume-title">{resumeStory.name}</h2>
                      <div className="dash-resume-meta">
                        <span className="dash-chip-version">v{resumeStory.latestVersion}</span>
                        <time dateTime={resumeStory.updatedAt}>
                          Edited {relativeTime(currentTime, resumeStory.updatedAt)}
                        </time>
                      </div>
                    </div>
                    <div className="dash-resume-action">
                      <button
                        type="button"
                        className="dash-btn-primary"
                        onClick={() => handleOpenProject(resumeStory.id)}
                      >
                        <span>Open story</span>
                        <IconArrowRight />
                      </button>
                    </div>
                  </article>
                </section>
              )}

          {/* Toolbar: Search, Sort, View Toggle, Benchmark Switch */}
          {!loading && !isUnauthenticated && !errorMessage && projects.length > 0 && (
            <div className="dash-toolbar" role="toolbar" aria-label="Story filtering and sorting">
              <div className="dash-toolbar-left">
                {/* Search */}
                <div className="dash-search-box">
                  <span className="dash-search-icon" aria-hidden="true">
                    <IconSearch />
                  </span>
                  <input
                    type="search"
                    id="dash-search-input"
                    className="dash-search-input"
                    placeholder="Search stories by title…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search stories by title"
                  />
                  {query && (
                    <button
                      type="button"
                      className="dash-search-clear"
                      onClick={() => setQuery("")}
                      aria-label="Clear search input"
                    >
                      <IconClear />
                    </button>
                  )}
                </div>

                {/* Sort selector */}
                <div className="dash-sort-box">
                  <label htmlFor="dash-sort-select" className="dash-sort-label">
                    Sort:
                  </label>
                  <select
                    id="dash-sort-select"
                    className="dash-sort-select"
                    value={sortOption}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "last-updated" || val === "created" || val === "name") {
                        setSortOption(val);
                      }
                    }}
                    aria-label="Sort stories by"
                  >
                    <option value="last-updated">Last updated</option>
                    <option value="created">Created</option>
                    <option value="name">Name</option>
                  </select>
                </div>
              </div>

              <div className="dash-toolbar-right">
                {/* Benchmark Stories Switch */}
                <div className="dash-switch-wrapper">
                  <button
                    type="button"
                    role="switch"
                    id="dash-benchmark-switch"
                    aria-checked={showBenchmarks}
                    className={`dash-switch-btn ${showBenchmarks ? "is-active" : ""}`}
                    onClick={() => setShowBenchmarks((prev) => !prev)}
                  >
                    <span className="dash-switch-thumb" aria-hidden="true" />
                  </button>
                  <label htmlFor="dash-benchmark-switch" className="dash-switch-label">
                    Show benchmark stories
                  </label>
                  {!showBenchmarks && hiddenBenchmarkCount > 0 && (
                    <span className="dash-benchmark-hint" title="Heuristic detection">
                      (Hidden: {hiddenBenchmarkCount})
                    </span>
                  )}
                </div>

                {/* View Mode Toggle */}
                <div className="dash-view-toggle" role="group" aria-label="View layout">
                  <button
                    type="button"
                    className={`dash-toggle-btn ${viewMode === "grid" ? "is-active" : ""}`}
                    onClick={() => setViewMode("grid")}
                    aria-pressed={viewMode === "grid"}
                    aria-label="Grid layout"
                  >
                    <IconGrid />
                  </button>
                  <button
                    type="button"
                    className={`dash-toggle-btn ${viewMode === "list" ? "is-active" : ""}`}
                    onClick={() => setViewMode("list")}
                    aria-pressed={viewMode === "list"}
                    aria-label="List layout"
                  >
                    <IconList />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* States: Loading, Unauthenticated, Error, Empty, No Results */}
          {loading && (
            <div
              className="dash-skeleton-grid dashboard-loading-card"
              role="status"
              aria-label="Loading your stories…"
            >
              <div className="sr-only">Loading your stories…</div>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={`skel-${i}`} className="dash-card dash-card-skeleton">
                  <div className="dash-skeleton-preview" />
                  <div className="dash-skeleton-content">
                    <div className="dash-skeleton-line short" />
                    <div className="dash-skeleton-line long" />
                    <div className="dash-skeleton-line medium" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && !isUnauthenticated && errorMessage && (
            <div className="dash-state-card dashboard-state-card state-error" role="alert">
              <div className="dash-state-icon">⚠️</div>
              <span className="dashboard-dialog-badge tag-danger">Unable to Connect</span>
              <h2 className="dash-state-title">Failed to Load Stories</h2>
              <p className="dash-state-desc">{errorMessage}</p>
              <div className="dash-state-actions">
                <button type="button" className="dash-btn-primary" onClick={handleRetry}>
                  Retry Connection
                </button>
              </div>
            </div>
          )}

          {!loading && !isUnauthenticated && !errorMessage && projects.length === 0 && (
            <div className="dash-state-card dashboard-empty-card state-empty">
              <div className="dash-state-icon">📖</div>
              <h2 className="dash-state-title">No Stories Found</h2>
              <p className="dash-state-desc">
                You have not created any narrative projects yet. Initialize your first story graph to start authoring branching dialogue and lore.
              </p>
              <div className="dash-state-actions">
                <button
                  type="button"
                  className="dash-btn-primary"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <IconPlus />
                  <span>+ Create Your First Story</span>
                </button>
                <Link href="/editor" className="dash-btn-secondary">
                  Explore Sample Story
                </Link>
              </div>
            </div>
          )}

          {!loading && !isUnauthenticated && !errorMessage && projects.length > 0 && visibleStories.length === 0 && (
            <div className="dash-no-results">
              <p>No stories matching &ldquo;{query}&rdquo;</p>
              <button
                type="button"
                className="dash-btn-secondary"
                onClick={() => {
                  setQuery("");
                  setShowBenchmarks(true);
                }}
              >
                Clear search filters
              </button>
            </div>
          )}

          {/* Stories Display: Grid or List */}
          {!loading && !isUnauthenticated && !errorMessage && visibleStories.length > 0 && (
            <div className="dash-results-container">
              {viewMode === "grid" ? (
                <div className="dash-stories-grid" role="list">
                  {visibleStories.map((story) => (
                    <article
                      key={story.id}
                      className="dash-card"
                      role="listitem"
                      aria-labelledby={`title-${story.id}`}
                    >
                      {/* Real Story Thumbnail Preview */}
                      <div className="dash-card-media">
                        <StoryThumbnailView
                          projectId={story.id}
                          latestVersion={story.latestVersion}
                          loader={previewLoader}
                          variant="card"
                        />
                      </div>

                      {/* Card Body */}
                      <div className="dash-card-body">
                        <div className="dash-card-meta-row">
                          <span className="dash-chip-version">v{story.latestVersion}</span>
                          <time
                            dateTime={story.updatedAt}
                            title={new Date(story.updatedAt).toLocaleString("en-US")}
                            className="dash-card-time"
                          >
                            Edited {relativeTime(currentTime, story.updatedAt)}
                          </time>
                        </div>

                        <h3 id={`title-${story.id}`} className="dash-card-title">
                          <Link
                            href={`/projects/${encodeURIComponent(story.id)}`}
                            className="dash-stretched-link"
                          >
                            {story.name}
                          </Link>
                        </h3>

                        <div className="dash-card-footer">
                          <span className="dash-card-id-hint" title={story.id}>
                            ID: {story.id.slice(0, 8)}…
                          </span>

                          {/* 3-Dot Overflow Menu */}
                          <div className="dash-overflow-wrap">
                            <button
                              type="button"
                              className="dash-overflow-btn"
                              aria-haspopup="menu"
                              aria-expanded={activeMenuId === story.id}
                              aria-label={`Actions for ${story.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId((current) => (current === story.id ? null : story.id));
                              }}
                            >
                              <IconMoreVertical />
                            </button>

                            <div
                              className={`dash-card-menu ${activeMenuId === story.id ? "is-open" : ""}`}
                              role="menu"
                              aria-label={`Story actions for ${story.name}`}
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className="dash-menu-item"
                                onClick={() => handleOpenProject(story.id)}
                              >
                                <IconArrowRight />
                                <span>Open story</span>
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="dash-menu-item"
                                onClick={(e) => void handleCopyId(story.id, e)}
                              >
                                <IconCopy />
                                <span>{copiedId === story.id ? "Copied!" : "Copy ID"}</span>
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="dash-menu-item item-danger"
                                aria-label={`Delete ${story.name}`}
                                onClick={(e) => {
                                  lastDeleteTriggerRef.current = e.currentTarget;
                                  setDeleteTarget(story);
                                  setActiveMenuId(null);
                                }}
                              >
                                <IconTrash />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                /* List View (Table-like rows) */
                <div className="dash-stories-list" role="list">
                  <div className="dash-list-header" role="row">
                    <span className="col-preview">Preview</span>
                    <span className="col-title">Title</span>
                    <span className="col-version">Version</span>
                    <span className="col-updated">Updated</span>
                    <span className="col-created">Created</span>
                    <span className="col-actions">Actions</span>
                  </div>

                  {visibleStories.map((story) => (
                    <div
                      key={story.id}
                      className="dash-list-row"
                      role="listitem"
                      aria-labelledby={`list-title-${story.id}`}
                    >
                      <div className="col-preview">
                        <StoryThumbnailView
                          projectId={story.id}
                          latestVersion={story.latestVersion}
                          loader={previewLoader}
                          variant="list"
                        />
                      </div>

                      <div className="col-title">
                        <Link
                          id={`list-title-${story.id}`}
                          href={`/projects/${encodeURIComponent(story.id)}`}
                          className="dash-list-title-link"
                        >
                          {story.name}
                        </Link>
                      </div>

                      <div className="col-version">
                        <span className="dash-chip-version">v{story.latestVersion}</span>
                      </div>

                      <div className="col-updated">
                        <time dateTime={story.updatedAt}>
                          {relativeTime(currentTime, story.updatedAt)}
                        </time>
                      </div>

                      <div className="col-created">
                        <time dateTime={story.createdAt}>
                          {new Date(story.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </time>
                      </div>

                      <div className="col-actions">
                        <div className="dash-overflow-wrap">
                          <button
                            type="button"
                            className="dash-overflow-btn"
                            aria-haspopup="menu"
                            aria-expanded={activeMenuId === story.id}
                            aria-label={`Actions for ${story.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId((current) => (current === story.id ? null : story.id));
                            }}
                          >
                            <IconMoreVertical />
                          </button>

                          <div
                            className={`dash-card-menu ${activeMenuId === story.id ? "is-open" : ""}`}
                            role="menu"
                            aria-label={`Actions for ${story.name}`}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className="dash-menu-item"
                              onClick={() => handleOpenProject(story.id)}
                            >
                              <IconArrowRight />
                              <span>Open story</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="dash-menu-item"
                              onClick={(e) => void handleCopyId(story.id, e)}
                            >
                              <IconCopy />
                              <span>{copiedId === story.id ? "Copied!" : "Copy ID"}</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="dash-menu-item item-danger"
                              aria-label={`Delete ${story.name}`}
                              onClick={(e) => {
                                lastDeleteTriggerRef.current = e.currentTarget;
                                setDeleteTarget(story);
                                setActiveMenuId(null);
                              }}
                            >
                              <IconTrash />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
            </>
          )}
        </div>
      </main>

      {/* 3. Modal Dialogs */}
      <CreateStoryDialog
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreate={handleCreateStory}
      />

      <DeleteStoryDialog
        key={deleteTarget?.id ?? "none"}
        isOpen={deleteTarget !== null}
        project={deleteTarget}
        onClose={() => {
          setDeleteTarget(null);
          // Return focus to triggering overflow button
          lastDeleteTriggerRef.current?.focus();
        }}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
};
