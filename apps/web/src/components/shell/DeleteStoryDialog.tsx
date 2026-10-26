import React, { useState, useEffect, useRef } from "react";
import type { ProjectSummaryDto } from "../../api/types.js";

export interface DeleteStoryDialogProps {
  isOpen: boolean;
  project: ProjectSummaryDto | null;
  onClose: () => void;
  onConfirmDelete: (project: ProjectSummaryDto) => Promise<{ ok: boolean; error?: string }>;
}

export const DeleteStoryDialog: React.FC<DeleteStoryDialogProps> = ({
  isOpen,
  project,
  onClose,
  onConfirmDelete,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open && typeof dialog.showModal === "function") {
        dialog.showModal();
      }
    } else {
      if (dialog.open && typeof dialog.close === "function") {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleClose = () => {
    if (isPending) return;
    setIsPending(false);
    setErrorMessage(null);
    onClose();
  };

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    handleClose();
  };

  const handleDelete = async () => {
    if (!project || isPending) return;
    setIsPending(true);
    setErrorMessage(null);

    try {
      const result = await onConfirmDelete(project);
      if (!result.ok) {
        setErrorMessage(result.error ?? "Failed to delete story");
      }
    } catch {
      setErrorMessage("Network error: Unable to connect to server");
    } finally {
      setIsPending(false);
    }
  };

  if (!project) return null;

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog dashboard-dialog delete-dialog"
      onCancel={handleCancel}
      aria-labelledby="delete-story-dialog-title"
    >
      <div className="dialog-content">
        <header className="dialog-header">
          <span className="dashboard-dialog-badge tag-danger">Danger Zone</span>
          <h2 id="delete-story-dialog-title" className="dialog-title">
            Delete Story
          </h2>
          <p className="dialog-description">
            Are you sure you want to permanently delete{" "}
            <strong className="delete-target-name">{project.name}</strong>?
          </p>
        </header>

        <div className="delete-warning-callout" role="note">
          All versions, branching nodes, variables, and history will be permanently erased.
          This action cannot be reversed.
        </div>

        {errorMessage && (
          <div className="auth-error-banner" role="alert" aria-live="polite">
            <span className="auth-error-icon" aria-hidden="true">
              ⚠️
            </span>
            <span className="auth-error-text">{errorMessage}</span>
          </div>
        )}

        <div className="dialog-actions">
          <button
            type="button"
            className="shell-btn-secondary"
            onClick={handleClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="shell-btn-danger"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? "Deleting Story…" : "Yes, Delete Story"}
          </button>
        </div>
      </div>
    </dialog>
  );
};
