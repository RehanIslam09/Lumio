import React, { useEffect, useRef, useState, useCallback } from "react";
import { isReadableSchemaVersion, type Project } from "@repo/schema";
import type {
  FetchVersionOutcome,
  ListVersionsOutcome,
} from "../cloud/types.js";
import type { VersionSummaryDto } from "../api/types.js";
import { formatProjectDate } from "../lib/formatDate.js";
import { compareProjects, type ProjectDiff } from "../lib/diff.js";
import { VersionDiffView } from "./VersionDiffView.js";

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

export type HistoryViewMode = "list" | "diff";

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

  // Compare mode state
  const [viewMode, setViewMode] = useState<HistoryViewMode>("list");
  const [compareVersionA, setCompareVersionA] = useState<number | null>(null);
  const [compareVersionB, setCompareVersionB] = useState<number | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diff, setDiff] = useState<ProjectDiff | null>(null);

  // Quick compare bar selectors in list mode
  const [quickSelectA, setQuickSelectA] = useState<number>(1);
  const [quickSelectB, setQuickSelectB] = useState<number>(1);

  // In-memory document cache and cancellation generation for diff fetching
  const docCacheRef = useRef<Map<number, Project>>(new Map());
  const diffGenerationRef = useRef<number>(0);

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
        if (outcome.versions.length >= 2) {
          const sorted = [...outcome.versions].sort((a, b) => a.versionNumber - b.versionNumber);
          const first = sorted[0]?.versionNumber ?? 1;
          const last = sorted[sorted.length - 1]?.versionNumber ?? 1;
          setQuickSelectA(first);
          setQuickSelectB(last);
        }
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
    diffGenerationRef.current++;
    docCacheRef.current.clear();
    setVersions(null);
    setLoading(true);
    setListError(null);
    setActionError(null);
    setActionPending(false);
    setViewMode("list");
    setCompareVersionA(null);
    setCompareVersionB(null);
    setDiff(null);
    setDiffError(null);
    setDiffLoading(false);
    onClose();
  };

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    handleClose();
  };

  const loadDiff = useCallback(
    async (vA: number, vB: number) => {
      const older = Math.min(vA, vB);
      const newer = Math.max(vA, vB);
      setCompareVersionA(older);
      setCompareVersionB(newer);
      setDiffLoading(true);
      setDiffError(null);
      const gen = ++diffGenerationRef.current;

      try {
        const cache = docCacheRef.current;
        let docA = cache.get(older);
        let docB = cache.get(newer);

        if (!docA) {
          const outcomeA = await onFetchVersion(older);
          if (gen !== diffGenerationRef.current) return;
          if (!outcomeA || outcomeA.kind !== "loaded") {
            const msg =
              outcomeA?.kind === "unsupported-schema"
                ? `Version v${older} uses an unsupported schema version.`
                : outcomeA?.kind === "invalid-document"
                  ? `Version v${older} document is invalid.`
                  : outcomeA?.kind === "error"
                    ? outcomeA.message
                    : `Failed to load version v${older}.`;
            setDiffError(msg);
            setDiffLoading(false);
            return;
          }
          docA = outcomeA.project;
          cache.set(older, docA);
        }

        if (!docB) {
          const outcomeB = await onFetchVersion(newer);
          if (gen !== diffGenerationRef.current) return;
          if (!outcomeB || outcomeB.kind !== "loaded") {
            const msg =
              outcomeB?.kind === "unsupported-schema"
                ? `Version v${newer} uses an unsupported schema version.`
                : outcomeB?.kind === "invalid-document"
                  ? `Version v${newer} document is invalid.`
                  : outcomeB?.kind === "error"
                    ? outcomeB.message
                    : `Failed to load version v${newer}.`;
            setDiffError(msg);
            setDiffLoading(false);
            return;
          }
          docB = outcomeB.project;
          cache.set(newer, docB);
        }

        if (gen !== diffGenerationRef.current) return;
        const result = compareProjects(docA, docB);
        setDiff(result);
      } catch {
        if (gen === diffGenerationRef.current) {
          setDiffError("An error occurred while comparing versions.");
        }
      } finally {
        if (gen === diffGenerationRef.current) {
          setDiffLoading(false);
        }
      }
    },
    [onFetchVersion],
  );

  const startCompare = (vA: number, vB: number) => {
    if (vA === vB) return;
    setViewMode("diff");
    void loadDiff(vA, vB);
  };

  const handleRowCompare = (targetV: VersionSummaryDto) => {
    if (!versions || versions.length < 2) return;
    const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
    const targetNum = targetV.versionNumber;
    // Default baseline: previous version if exists, else lowest available
    let baseNum = targetNum > 1 ? targetNum - 1 : sorted[0]?.versionNumber ?? 1;
    if (baseNum === targetNum) {
      const other = sorted.find((x) => x.versionNumber !== targetNum);
      if (other) baseNum = other.versionNumber;
    }
    startCompare(baseNum, targetNum);
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

  const sortedAscending = versions
    ? [...versions].sort((a, b) => a.versionNumber - b.versionNumber)
    : [];

  return (
    <dialog
      ref={dialogRef}
      className={`modal-dialog history-dialog ${viewMode === "diff" ? "history-dialog-diff" : ""}`}
      onCancel={handleCancel}
      aria-labelledby="history-dialog-title"
    >
      <div className="dialog-content">
        <div className="dialog-header">
          <h2 id="history-dialog-title" className="dialog-title">
            {viewMode === "diff" ? "Visual Version Comparison" : "Version History"}
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
          {viewMode === "diff" ? (
            /* Diff View Mode */
            diffLoading ? (
              <div className="loading-state">
                Loading versions v{compareVersionA} and v{compareVersionB} for comparison...
              </div>
            ) : diffError ? (
              <div className="diff-error-state">
                <div className="banner banner-error" role="alert">
                  {diffError}
                </div>
                <div className="diff-error-actions button-group">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (compareVersionA && compareVersionB) {
                        void loadDiff(compareVersionA, compareVersionB);
                      }
                    }}
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setViewMode("list")}
                  >
                    ← Back to Version List
                  </button>
                </div>
              </div>
            ) : diff && compareVersionA && compareVersionB ? (
              <VersionDiffView
                versionA={compareVersionA}
                versionB={compareVersionB}
                versionsList={versions ?? []}
                diff={diff}
                onSelectVersions={(vA, vB) => {
                  void loadDiff(vA, vB);
                }}
                onBack={() => setViewMode("list")}
              />
            ) : null
          ) : (
            /* List View Mode */
            loading ? (
              <div className="loading-state">Loading version history...</div>
            ) : !versions || versions.length === 0 ? (
              <div className="empty-state">No version history available for this project.</div>
            ) : (
              <>
                {versions.length >= 2 && (
                  <div className="history-compare-bar" role="region" aria-label="Compare two versions">
                    <span className="history-compare-label">Compare:</span>
                    <label htmlFor="history-quick-select-a" className="sr-only">Baseline version</label>
                    <select
                      id="history-quick-select-a"
                      className="field-select history-compare-select"
                      value={quickSelectA}
                      onChange={(e) => setQuickSelectA(Number(e.target.value))}
                    >
                      {sortedAscending.map((v) => (
                        <option key={v.versionNumber} value={v.versionNumber}>
                          v{v.versionNumber}
                        </option>
                      ))}
                    </select>

                    <span className="history-compare-arrow" aria-hidden="true">→</span>

                    <label htmlFor="history-quick-select-b" className="sr-only">Target version</label>
                    <select
                      id="history-quick-select-b"
                      className="field-select history-compare-select"
                      value={quickSelectB}
                      onChange={(e) => setQuickSelectB(Number(e.target.value))}
                    >
                      {sortedAscending.map((v) => (
                        <option key={v.versionNumber} value={v.versionNumber}>
                          v{v.versionNumber}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={quickSelectA === quickSelectB}
                      title={quickSelectA === quickSelectB ? "Select two different versions to compare" : "Compare selected versions"}
                      onClick={() => startCompare(quickSelectA, quickSelectB)}
                    >
                      Compare
                    </button>
                  </div>
                )}

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
                          {versions.length >= 2 && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={actionPending}
                              title="Compare this version with another"
                              onClick={() => handleRowCompare(v)}
                            >
                              Compare
                            </button>
                          )}
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
            )
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
