import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import type { Project } from "@repo/schema";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { getApiBaseUrl } from "../../api/config.js";
import type { ProjectBinding } from "../../cloud/types.js";
import { runCloudOpen } from "../../cloud/outcomes.js";
import { CURRENT_SCHEMA_VERSION } from "../../persistence/index.js";
import { Link } from "../../router/Link.js";
import { AppHeader } from "./AppHeader.js";
import { MainStudio } from "../../App.js";

export interface ProjectWorkspaceProps {
  projectId: string;
  client?: ApiClient;
}

export type ProjectLoadStatus =
  | "loading"
  | "loaded"
  | "notFound"
  | "unauthenticated"
  | "error";

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  projectId,
  client: injectedClient,
}) => {
  const client = useMemo(() => {
    return injectedClient ?? createApiClient({ baseUrl: getApiBaseUrl() });
  }, [injectedClient]);

  const [status, setStatus] = useState<ProjectLoadStatus>("loading");
  const [project, setProject] = useState<Project | null>(null);
  const [binding, setBinding] = useState<ProjectBinding | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const outcome = await runCloudOpen({ client, projectId });
        if (!active) return;

        if (outcome.kind === "loaded") {
          setProject(outcome.project);
          setBinding(outcome.binding);
          setWarnings(outcome.warnings);
          setStatus("loaded");
        } else if (outcome.kind === "not-found") {
          setStatus("notFound");
        } else if (outcome.kind === "unauthenticated") {
          setStatus("unauthenticated");
        } else if (outcome.kind === "network") {
          setStatus("error");
          setErrorMessage("Network error: Unable to connect to server. Please check your connection.");
        } else if (outcome.kind === "timeout") {
          setStatus("error");
          setErrorMessage("Request timed out while loading project. Please try again.");
        } else if (outcome.kind === "unsupported-schema") {
          setStatus("error");
          setErrorMessage(
            `This story requires a newer version of Lumio (schema version ${outcome.supported ?? CURRENT_SCHEMA_VERSION}).`,
          );
        } else if (outcome.kind === "invalid-document") {
          setStatus("error");
          setErrorMessage(`Story document failed validation:\n${outcome.details.join("\n")}`);
        } else {
          setStatus("error");
          setErrorMessage(outcome.message || "Failed to load story from cloud.");
        }
      } catch (err: unknown) {
        if (!active) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while loading story.",
        );
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [client, projectId, retryCount]);

  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  if (status === "loaded" && project && binding) {
    return (
      <ReactFlowProvider key={projectId}>
        <MainStudio
          initialProject={project}
          initialBinding={binding}
          initialWarnings={warnings}
        />
      </ReactFlowProvider>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader currentRoute={{ kind: "project", projectId }} />
      <div className="shell-body">
        {status === "loading" && (
          <main
            className="shell-main placeholder-page workspace-loading-page"
            id="main-content"
            role="status"
            aria-busy="true"
            aria-label="Loading story workspace"
          >
            <div className="placeholder-card workspace-loading-card">
              <div className="placeholder-card-header">
                <span className="placeholder-tag tag-accent">Loading Story</span>
                <h1 className="placeholder-card-title">Opening Workspace…</h1>
              </div>
              <div className="placeholder-meta-row">
                <span className="meta-label">Story ID:</span>
                <code className="meta-code">{projectId}</code>
              </div>
              <div className="workspace-skeleton-body">
                <div className="skeleton-bar skeleton-title" />
                <div className="skeleton-bar skeleton-desc" />
                <div className="skeleton-canvas-preview">
                  <div className="skeleton-node node-1" />
                  <div className="skeleton-node node-2" />
                  <div className="skeleton-node node-3" />
                </div>
              </div>
              <p className="placeholder-card-text">
                Retrieving story document and latest version history from cloud storage…
              </p>
            </div>
          </main>
        )}

        {status === "notFound" && (
          <main className="shell-main placeholder-page" id="main-content">
            <div className="placeholder-card placeholder-project-card" role="alert">
              <div className="placeholder-card-header">
                <span className="placeholder-tag tag-error">404</span>
                <h1 className="placeholder-card-title">Story Not Found</h1>
              </div>
              <div className="placeholder-meta-row">
                <span className="meta-label">Requested ID:</span>
                <code className="meta-code">{projectId}</code>
              </div>
              <p className="placeholder-card-text">
                The requested story does not exist, has been deleted, or your account does not have
                access to view it.
              </p>
              <div className="placeholder-actions">
                <Link href="/dashboard" className="shell-btn-primary">
                  Back to Dashboard
                </Link>
                <Link href="/" className="shell-btn-secondary">
                  Home
                </Link>
              </div>
            </div>
          </main>
        )}

        {status === "unauthenticated" && (
          <main className="shell-main placeholder-page" id="main-content">
            <div className="placeholder-card placeholder-auth-card" role="alert">
              <div className="placeholder-card-header">
                <span className="placeholder-tag tag-warning">Session Required</span>
                <h1 className="placeholder-card-title">Authentication Required</h1>
              </div>
              <div className="placeholder-meta-row">
                <span className="meta-label">Story ID:</span>
                <code className="meta-code">{projectId}</code>
              </div>
              <p className="placeholder-card-text">
                You must be signed in to open this cloud story. Please sign in to your Lumio account
                or create a new account to view your workspace.
              </p>
              <div className="placeholder-actions">
                <Link href="/login" className="shell-btn-primary">
                  Sign In
                </Link>
                <Link href="/register" className="shell-btn-secondary">
                  Register
                </Link>
                <Link href="/dashboard" className="shell-btn-secondary">
                  Dashboard
                </Link>
              </div>
            </div>
          </main>
        )}

        {status === "error" && (
          <main className="shell-main placeholder-page" id="main-content">
            <div className="placeholder-card placeholder-error-card" role="alert">
              <div className="placeholder-card-header">
                <span className="placeholder-tag tag-error">Load Failed</span>
                <h1 className="placeholder-card-title">Unable to Open Story</h1>
              </div>
              <div className="placeholder-meta-row">
                <span className="meta-label">Story ID:</span>
                <code className="meta-code">{projectId}</code>
              </div>
              <div className="dashboard-error-banner" style={{ marginTop: "1rem", whiteSpace: "pre-wrap" }}>
                {errorMessage}
              </div>
              <div className="placeholder-actions" style={{ marginTop: "1.5rem" }}>
                <button
                  type="button"
                  className="shell-btn-primary"
                  onClick={handleRetry}
                >
                  Retry Loading
                </button>
                <Link href="/dashboard" className="shell-btn-secondary">
                  Back to Dashboard
                </Link>
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
};
