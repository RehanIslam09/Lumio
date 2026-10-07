import React, { useEffect, useRef, useState } from "react";
import { isReadableSchemaVersion, type Project } from "@repo/schema";
import type {
  FetchVersionOutcome,
  ListVersionsOutcome,
} from "../cloud/types.js";
import type { VersionSummaryDto } from "../api/types.js";
import { formatProjectDate } from "../lib/formatDate.js";

export interface HistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  baseVersion: number;
  isDirty: boolean;
  onListVersions: () => Promise<ListVersionsOutcome | null>;
  onFetchVersion: (versionNumber: number) => Promise<FetchVersionOutcome | null>;
  onRestore: (project: Project) => void;
  onDownload: (project: Project) => void;
}

export const HistoryDialog: React.FC<HistoryDialogProps> = ({
  isOpen,
  onClose,
  baseVersion,
  isDirty,
  onListVersions,
  onFetchVersion,
  onRestore,
  onDownload,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [versions, setVersions] = useState<VersionSummaryDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
      const outcome = await onListVersions();
      if (!active) return;
      setLoading(false);
      if (!outcome) {
        return;
      }
      if (outcome.kind === "listed") {
        setVersions(outcome.versions);
      } else if (outcome.kind === "unauthenticated" || outcome.kind === "not-found") {
        // Handled at useCloud level (closes dialog & prompts auth / not-found)
      } else if (outcome.kind === "network") {
        setListError("Network error: Unable to connect to server.");
      } else if (outcome.kind === "timeout") {
        setListError("Request timed out. Please try again.");
      } else if (outcome.kind === "error") {
        setListError(outcome.message);
      } else {
        setListError("Failed to load version history.");
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [isOpen, onListVersions]);

  const handleClose = () => {
    if (actionPending) return;
    setVersions(null);
    setLoading(true);
    setListError(null);
    setActionError(null);
    setActionPending(false);
    onClose();
  };

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    handleClose();
  };

  const handleRestoreClick = async (v: VersionSummaryDto) => {
    if (actionPending || !isReadableSchemaVersion(v.schemaVersion)) return;

    if (isDirty) {
      const ok = window.confirm(
        "Restore this version as your working copy? Your current unsaved edits will be replaced.",
      );
      if (!ok) return;
    }

    setActionPending(true);
    setActionError(null);

    try {
      const outcome = await onFetchVersion(v.versionNumber);
      if (!outcome) return;

      if (outcome.kind === "loaded") {
        onRestore(outcome.project);
        handleClose();
      } else if (outcome.kind === "invalid-document") {
        setActionError("The selected version document is invalid and cannot be restored.");
      } else if (outcome.kind === "unsupported-schema") {
        setActionError("This version uses an unsupported schema version.");
      } else if (outcome.kind === "network") {
        setActionError("Network error: Unable to restore version.");
      } else if (outcome.kind === "timeout") {
        setActionError("Request timed out while restoring version.");
      } else if (outcome.kind === "error") {
        setActionError(outcome.message);
      }
    } finally {
      setActionPending(false);
    }
  };

  const handleDownloadClick = async (v: VersionSummaryDto) => {
    if (actionPending || !isReadableSchemaVersion(v.schemaVersion)) return;

    setActionPending(true);
    setActionError(null);

    try {
      const outcome = await onFetchVersion(v.versionNumber);
      if (!outcome) return;

      if (outcome.kind === "loaded") {
        onDownload(outcome.project);
      } else if (outcome.kind === "invalid-document") {
        setActionError("The selected version document is invalid and cannot be downloaded.");
      } else if (outcome.kind === "unsupported-schema") {
        setActionError("This version uses an unsupported schema version.");
      } else if (outcome.kind === "network") {
        setActionError("Network error: Unable to download version.");
      } else if (outcome.kind === "timeout") {
        setActionError("Request timed out while downloading version.");
      } else if (outcome.kind === "error") {
        setActionError(outcome.message);
      }
    } finally {
      setActionPending(false);
    }
  };

  const highestVersion =
    versions && versions.length > 0
      ? Math.max(...versions.map((v) => v.versionNumber))
      : -1;

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog history-dialog"
      onCancel={handleCancel}
      aria-labelledby="history-dialog-title"
    >
      <div className="dialog-content">
        <div className="dialog-header">
          <h2 id="history-dialog-title" className="dialog-title">
            Version History
          </h2>
          <button
            type="button"
            className="btn btn-icon"
            onClick={handleClose}
            disabled={actionPending}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {listError && (
          <div className="banner banner-error" role="alert">
            {listError}
          </div>
        )}

        {actionError && (
          <div className="banner banner-error" role="alert">
            {actionError}
          </div>
        )}

        <div className="dialog-body history-list-container">
          {loading ? (
            <div className="loading-state">Loading version history...</div>
          ) : !versions || versions.length === 0 ? (
            <div className="empty-state">No version history available for this project.</div>
          ) : (
            <>
              {versions.length === 200 && (
                <div className="history-limit-note">
                  Showing the newest 200 versions.
                </div>
              )}
              <div className="history-version-list" role="list">
                {versions.map((v) => {
                  const isLatest = v.versionNumber === highestVersion;
                  const isSynced = v.versionNumber === baseVersion;
                  const isSupported = isReadableSchemaVersion(v.schemaVersion);

                  return (
                    <div
                      key={v.versionNumber}
                      className={`history-version-row ${isSynced ? "synced-row" : ""}`}
                      role="listitem"
                    >
                      <div className="version-info">
                        <div className="version-heading">
                          <span className="version-tag">v{v.versionNumber}</span>
                          {isLatest && <span className="chip chip-latest">Latest</span>}
                          {isSynced && <span className="chip chip-synced">Synced</span>}
                          {!isSupported && (
                            <span className="chip chip-unsupported" title="Incompatible schema version">
                              Unsupported schema
                            </span>
                          )}
                        </div>
                        <div className="version-meta">
                          <span className="version-time">{formatProjectDate(v.createdAt)}</span>
                          <span className="version-author">
                            {v.createdByMe ? "You" : "Collaborator"}
                          </span>
                        </div>
                      </div>

                      <div className="version-actions button-group">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={actionPending || !isSupported}
                          title={
                            !isSupported
                              ? "Incompatible schema version (cannot restore)"
                              : "Restore this version as your working copy"
                          }
                          onClick={() => void handleRestoreClick(v)}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={actionPending || !isSupported}
                          title={
                            !isSupported
                              ? "Incompatible schema version (cannot download)"
                              : "Download this version as a JSON file"
                          }
                          onClick={() => void handleDownloadClick(v)}
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClose}
            disabled={actionPending}
          >
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
};
