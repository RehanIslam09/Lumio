import React, { useEffect, useRef } from "react";
import type { Project } from "@repo/schema";

export interface ConflictDialogProps {
  isOpen: boolean;
  currentVersion: number;
  snapshot: Project;
  onKeepMine: () => void;
  onLoadLatest: () => void;
  onDownloadCopy: () => void;
  onCancel: () => void;
}

export const ConflictDialog: React.FC<ConflictDialogProps> = ({
  isOpen,
  currentVersion,
  onKeepMine,
  onLoadLatest,
  onDownloadCopy,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

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

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    onCancel();
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog conflict-dialog"
      onCancel={handleCancel}
      aria-labelledby="conflict-dialog-title"
    >
      <div className="dialog-content">
        <h2 id="conflict-dialog-title" className="dialog-title">
          Cloud Version Conflict
        </h2>

        <p className="dialog-description">
          The cloud project has been updated to <strong>v{currentVersion}</strong> by another session since you loaded it.
          Choose how you would like to resolve this conflict:
        </p>

        <div className="dialog-conflict-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onKeepMine}
            title="Save your current version as the latest version on the cloud"
          >
            Keep my version as a new version
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onLoadLatest}
            title="Load the latest cloud version (your unsaved changes will be lost unless downloaded)"
          >
            Load the latest cloud version
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onDownloadCopy}
            title="Download your current work as a local JSON file without modifying cloud status"
          >
            Download my copy
          </button>
        </div>

        <div className="dialog-actions" style={{ marginTop: "1.5rem" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
};
