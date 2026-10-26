import React, { useState, useRef } from "react";
import { bodyCounter } from "../lib/entities.js";
import { renderMarkdown } from "../lib/markdown.js";

export interface MarkdownBodyFieldProps {
  id: string;
  nodeId: string;
  label?: string;
  value: string;
  rows?: number;
  placeholder?: string;
  onCommit: (nextValue: string) => void;
}

export type MarkdownBodyMode = "write" | "preview";

export const MarkdownBodyField: React.FC<MarkdownBodyFieldProps> = ({
  id,
  nodeId,
  label = "Body",
  value,
  rows = 5,
  placeholder = "Scene body text or dialogue... (Markdown supported)",
  onCommit,
}) => {
  const [draft, setDraft] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const [prevNodeId, setPrevNodeId] = useState(nodeId);
  const [mode, setMode] = useState<MarkdownBodyMode>("write");

  // Ref to prevent blur-commit when user clicks Write/Preview tab buttons
  const isSwitchingTabRef = useRef(false);

  // Sync state if node changes
  if (nodeId !== prevNodeId) {
    setPrevNodeId(nodeId);
    setPrevValue(value);
    setDraft(value);
    setMode("write");
  } else if (value !== prevValue) {
    // Sync draft when external value changes (e.g. undo/redo)
    setPrevValue(value);
    setDraft(value);
  }

  const counter = bodyCounter(draft);

  const [announcedOverLimit, setAnnouncedOverLimit] = useState(false);
  const isOverLimit = counter.isOverLimit;
  let liveAnnouncement = "";
  if (isOverLimit !== announcedOverLimit) {
    setAnnouncedOverLimit(isOverLimit);
    liveAnnouncement = isOverLimit
      ? `Character limit exceeded: ${counter.count} of ${counter.max} code points`
      : "Character count within limit";
  }

  const handleCommit = () => {
    if (draft !== value) {
      onCommit(draft);
    }
  };

  const handleBlur = () => {
    if (isSwitchingTabRef.current) {
      isSwitchingTabRef.current = false;
      return;
    }
    handleCommit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setDraft(value);
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleCommit();
    }
  };

  return (
    <div className="field-group markdown-body-field">
      <div className="field-header">
        <div className="field-header-left">
          <label htmlFor={id} className="field-label">
            {label}
          </label>
          <div className="markdown-tabs" role="tablist" aria-label="Body Editor View">
            <button
              type="button"
              role="tab"
              id={`${id}-tab-write`}
              aria-selected={mode === "write"}
              aria-controls={`${id}-panel-write`}
              className={`markdown-tab-btn ${mode === "write" ? "active" : ""}`}
              onClick={() => setMode("write")}
              onMouseDown={() => {
                isSwitchingTabRef.current = true;
              }}
            >
              Write
            </button>
            <button
              type="button"
              role="tab"
              id={`${id}-tab-preview`}
              aria-selected={mode === "preview"}
              aria-controls={`${id}-panel-preview`}
              className={`markdown-tab-btn ${mode === "preview" ? "active" : ""}`}
              onClick={() => setMode("preview")}
              onMouseDown={() => {
                isSwitchingTabRef.current = true;
              }}
            >
              Preview
            </button>
          </div>
        </div>

        <span
          className={`counter-badge ${counter.isOverLimit ? "counter-over" : ""}`}
          aria-hidden="true"
        >
          {counter.count.toLocaleString()} / {counter.max.toLocaleString()}
        </span>
      </div>

      {mode === "write" ? (
        <div id={`${id}-panel-write`} role="tabpanel" aria-labelledby={`${id}-tab-write`}>
          <textarea
            id={id}
            className={`field-textarea ${counter.isOverLimit ? "has-error" : ""}`}
            rows={rows}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
        </div>
      ) : (
        <div
          id={`${id}-panel-preview`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-preview`}
          className="markdown-preview-container"
          tabIndex={0}
        >
          {renderMarkdown(draft)}
        </div>
      )}

      {liveAnnouncement && (
        <span className="sr-only" aria-live="polite">
          {liveAnnouncement}
        </span>
      )}
    </div>
  );
};
