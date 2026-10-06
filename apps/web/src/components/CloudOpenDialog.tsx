import React, { useState, useEffect, useRef } from "react";
import type { ApiClient } from "../api/client.js";
import type { ProjectSummaryDto } from "../api/types.js";
import { runCloudDelete, runCloudList } from "../cloud/outcomes.js";

export interface CloudOpenDialogProps {
  isOpen: boolean;
  onClose: () => void;
  client: ApiClient;
  boundProjectId: string | null;
  onOpenProject: (projectId: string) => void;
  onProjectDeleted: (projectId: string) => void;
}

export const CloudOpenDialog: React.FC<CloudOpenDialogProps> = ({
  isOpen,
  onClose,
  client,
  boundProjectId,
  onOpenProject,
  onProjectDeleted,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [projects, setProjects] = useState<ProjectSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    async function load() {
      const outcome = await runCloudList({ client });
      if (!active) return;
      setLoading(false);
      if (outcome.kind === "listed") {
        setProjects(outcome.projects);
      } else if (outcome.kind === "unauthenticated") {
        setErrorMessage("Your session has expired. Please sign in again.");
      } else if (outcome.kind === "network") {
        setErrorMessage("Network error: Unable to connect to server.");
      } else if (outcome.kind === "timeout") {
        setErrorMessage("Request timed out. Please try again.");
      } else if (outcome.kind === "error") {
        setErrorMessage(outcome.message);
      } else {
        setErrorMessage("Failed to load project list.");
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [isOpen, client]);

  const handleClose = () => {
    setProjects([]);
    setErrorMessage(null);
    setLoading(true);
    onClose();
  };

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    handleClose();
  };

  const handleDelete = async (project: ProjectSummaryDto) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${project.name}" from the cloud? All versions will be permanently removed.`,
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const outcome = await runCloudDelete({ client, projectId: project.id });
      if (outcome.kind === "deleted") {
        setProjects((prev) => prev.filter((p) => p.id !== project.id));
        if (project.id === boundProjectId) {
          onProjectDeleted(project.id);
        }
      } else if (outcome.kind === "not-found") {
        // Already deleted
        setProjects((prev) => prev.filter((p) => p.id !== project.id));
        if (project.id === boundProjectId) {
          onProjectDeleted(project.id);
        }
      } else if (outcome.kind === "unauthenticated") {
        setErrorMessage("Your session has expired. Please sign in again.");
      } else if (outcome.kind === "error") {
        setErrorMessage(outcome.message);
      } else {
        setErrorMessage("Failed to delete project.");
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    } catch {
      return isoString;
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog cloud-open-dialog"
      onCancel={handleCancel}
      aria-labelledby="cloud-open-title"
    >
      <div className="dialog-content">
        <h2 id="cloud-open-title" className="dialog-title">
          Open Project from Cloud
        </h2>

        {errorMessage && (
          <div className="dialog-error" role="status" aria-live="polite">
            {errorMessage}
          </div>
        )}

        {loading && (
          <div className="dialog-loading" aria-live="polite">
            Loading cloud projects…
          </div>
        )}

        {!loading && projects.length === 0 && !errorMessage && (
          <div className="dialog-empty">No cloud projects found. Save your first project to the cloud!</div>
        )}

        {!loading && projects.length > 0 && (
          <div className="cloud-project-list" role="list">
            {projects.map((p) => (
              <div key={p.id} className="cloud-project-row" role="listitem">
                <div className="project-info">
                  <span className="project-name">{p.name}</span>
                  <div className="project-meta">
                    <span className="project-version">v{p.latestVersion}</span>
                    <span className="project-time">Updated {formatDate(p.updatedAt)}</span>
                  </div>
                </div>

                <div className="project-actions button-group">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      onOpenProject(p.id);
                      onClose();
                    }}
                    title="Open this project in the editor"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(p)}
                    title="Delete this project from cloud"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClose}
          >
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
};
