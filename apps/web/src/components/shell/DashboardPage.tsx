import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "../../router/Link.js";
import { navigate } from "../../router/router.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { getApiBaseUrl } from "../../api/config.js";
import type { ProjectSummaryDto, UserDto } from "../../api/types.js";
import { runAuthMe, runCloudDelete, runCloudList } from "../../cloud/outcomes.js";
import { formatProjectDate } from "../../lib/formatDate.js";
import {
  CURRENT_SCHEMA_VERSION,
  makeEmptyProject,
} from "../../persistence/index.js";
import { CreateStoryDialog } from "./CreateStoryDialog.js";
import { DeleteStoryDialog } from "./DeleteStoryDialog.js";

export interface DashboardPageProps {
  client?: ApiClient;
  onOpenProject?: (projectId: string) => void;
  initialProjects?: ProjectSummaryDto[];
  initialIsUnauthenticated?: boolean;
  initialErrorMessage?: string | null;
  skipAutoFetch?: boolean;
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

export const DashboardPage: React.FC<DashboardPageProps> = ({
  client: injectedClient,
  onOpenProject,
  initialProjects,
  initialIsUnauthenticated = false,
  initialErrorMessage = null,
  skipAutoFetch = false,
}) => {
  const client = useMemo(() => {
    return injectedClient ?? createApiClient({ baseUrl: getApiBaseUrl() });
  }, [injectedClient]);

  const [projects, setProjects] = useState<ProjectSummaryDto[]>(initialProjects ?? []);
  const [loading, setLoading] = useState<boolean>(!skipAutoFetch && initialProjects === undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage);
  const [isUnauthenticated, setIsUnauthenticated] = useState<boolean>(initialIsUnauthenticated);
  const [user, setUser] = useState<UserDto | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummaryDto | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  useEffect(() => {
    if (skipAutoFetch) return;
    let active = true;

    async function fetchDashboardData() {
      try {
        const [listOutcome, meOutcome] = await Promise.all([
          runCloudList({ client }),
          runAuthMe({ client }),
        ]);
        if (!active) return;

        if (meOutcome.kind === "signed-in") {
          setUser(meOutcome.user);
        } else {
          setUser(null);
        }

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

  const handleRetry = useCallback(() => {
    setLoading(true);
    setErrorMessage(null);
    setIsUnauthenticated(false);
    setReloadCounter((c) => c + 1);
  }, []);

  const handleOpenProject = (projectId: string) => {
    if (onOpenProject) {
      onOpenProject(projectId);
    } else {
      navigate(`/projects/${encodeURIComponent(projectId)}`);
    }
  };

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

  return (
    <main className="shell-main dashboard-page" id="main-content">
      {/* 1. Dashboard Header */}
      <section className="dashboard-header" aria-labelledby="dashboard-title">
        <div className="dashboard-header-inner">
          <div className="dashboard-header-left">
            <div className="dashboard-kicker">
              <span className="dashboard-brand-logo" aria-hidden="true">
                ◆
              </span>{" "}
              Narrative Project Hub
            </div>
            <h1 id="dashboard-title" className="dashboard-title">
              Your Story Workbench
            </h1>
            <p className="dashboard-subtitle">
              Manage, author, and simulate your branching game narratives.
            </p>
          </div>

          <div className="dashboard-header-actions">
            {user && (
              <span className="dashboard-user-pill" title={`User ID: ${user.id}`}>
                <span className="user-dot" aria-hidden="true" />
                <span className="user-email">{user.email}</span>
              </span>
            )}
            <button
              type="button"
              className="shell-btn-primary dashboard-create-btn"
              onClick={() => setCreateDialogOpen(true)}
              aria-haspopup="dialog"
            >
              + New Story
            </button>
            <Link href="/editor" className="shell-btn-secondary dashboard-editor-btn">
              Launch Editor →
            </Link>
          </div>
        </div>
      </section>

      {/* 2. Main Content Body */}
      <section className="dashboard-content" aria-label="Stories Content">
        {loading && (
          <div className="dashboard-state-card dashboard-loading-card" role="status" aria-live="polite">
            <div className="dashboard-loading-spinner" aria-hidden="true" />
            <span className="dashboard-loading-text">Loading your stories…</span>
          </div>
        )}

        {!loading && isUnauthenticated && (
          <div className="dashboard-state-card dashboard-auth-card" role="alert">
            <div className="dashboard-state-header">
              <span className="placeholder-tag tag-accent">Session Notice</span>
              <h2 className="dashboard-state-title">Authentication Required</h2>
            </div>
            <p className="dashboard-state-text">
              Your session has expired or you are not currently signed in. Please authenticate to view
              and manage your saved cloud stories.
            </p>
            <div className="dashboard-state-actions">
              <Link href="/login" className="shell-btn-primary">
                Sign In →
              </Link>
              <Link href="/register" className="shell-btn-secondary">
                Create Account
              </Link>
              <Link href="/" className="shell-btn-secondary">
                Return to Home
              </Link>
            </div>
          </div>
        )}

        {!loading && !isUnauthenticated && errorMessage && (
          <div className="dashboard-state-card dashboard-error-card" role="alert">
            <div className="dashboard-state-header">
              <span className="placeholder-tag tag-error">Unable to Connect</span>
              <h2 className="dashboard-state-title">Failed to Load Stories</h2>
            </div>
            <p className="dashboard-state-text">{errorMessage}</p>
            <div className="dashboard-state-actions">
              <button
                type="button"
                className="shell-btn-primary"
                onClick={handleRetry}
              >
                Retry Connection
              </button>
              <Link href="/editor" className="shell-btn-secondary">
                Open Local Editor
              </Link>
            </div>
          </div>
        )}

        {!loading && !isUnauthenticated && !errorMessage && projects.length === 0 && (
          <div className="dashboard-state-card dashboard-empty-card">
            <div className="dashboard-empty-icon" aria-hidden="true">
              ◇
            </div>
            <h2 className="dashboard-state-title">No Stories Found</h2>
            <p className="dashboard-state-text">
              You haven't created any branching stories yet. Create your first narrative graph to begin
              authoring scenes, variables, and conditions.
            </p>
            <div className="dashboard-state-actions">
              <button
                type="button"
                className="shell-btn-primary"
                onClick={() => setCreateDialogOpen(true)}
              >
                + Create Your First Story
              </button>
              <Link href="/editor" className="shell-btn-secondary">
                Explore Sample Story
              </Link>
            </div>
          </div>
        )}

        {!loading && !isUnauthenticated && !errorMessage && projects.length > 0 && (
          <div className="dashboard-stories-container">
            <div className="dashboard-toolbar-row">
              <span className="dashboard-count-badge">
                {projects.length} {projects.length === 1 ? "Story" : "Stories"}
              </span>
              <span className="dashboard-sort-note">Ordered by last updated</span>
            </div>

            <div className="dashboard-grid">
              {projects.map((project) => (
                <article key={project.id} className="story-card" aria-labelledby={`title-${project.id}`}>
                  <div className="story-card-top">
                    <div className="story-card-title-group">
                      <span className="story-version-chip">v{project.latestVersion}</span>
                      <h3 id={`title-${project.id}`} className="story-card-title">
                        {project.name}
                      </h3>
                    </div>
                  </div>

                  <div className="story-card-meta">
                    <div className="story-meta-item">
                      <span className="meta-label">Updated:</span>
                      <span className="meta-value">{formatProjectDate(project.updatedAt)}</span>
                    </div>
                    <div className="story-meta-item">
                      <span className="meta-label">Created:</span>
                      <span className="meta-value">{formatProjectDate(project.createdAt)}</span>
                    </div>
                    <div className="story-meta-item meta-id-row">
                      <span className="meta-label">ID:</span>
                      <code className="story-id-code" title={project.id}>
                        {project.id.slice(0, 8)}…
                      </code>
                    </div>
                  </div>

                  <div className="story-card-actions">
                    <button
                      type="button"
                      className="shell-btn-primary story-open-btn"
                      onClick={() => handleOpenProject(project.id)}
                    >
                      Open Story →
                    </button>
                    <button
                      type="button"
                      className="shell-btn-secondary story-delete-btn"
                      onClick={() => setDeleteTarget(project)}
                      aria-label={`Delete ${project.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 3. Modal Dialogs */}
      <CreateStoryDialog
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreate={handleCreateStory}
      />

      <DeleteStoryDialog
        isOpen={deleteTarget !== null}
        project={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirmDelete={handleConfirmDelete}
      />
    </main>
  );
};
