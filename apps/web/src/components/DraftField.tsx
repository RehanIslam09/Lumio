import React, { useState } from "react";
import type { DraftProblem } from "../lib/draftCheck.js";
import { bodyCounter } from "../lib/entities.js";

interface DraftFieldProps {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  onCommit: (nextValue: string) => void;
  checkDraft?: (draft: string) => { status: "empty" | "ok" | "error"; problems: DraftProblem[] };
  showCounter?: boolean;
}

export const DraftField: React.FC<DraftFieldProps> = ({
  id,
  label,
  value,
  multiline = false,
  rows = 3,
  placeholder,
  onCommit,
  checkDraft,
  showCounter = false,
}) => {
  const [draft, setDraft] = useState(value);
  const [prevValue, setPrevValue] = useState(value);

  // Sync draft when external value changes (e.g. undo/redo or selection switch)
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }

  const liveProblems = checkDraft ? checkDraft(draft).problems : [];
  const counter = showCounter ? bodyCounter(draft) : null;

  const [announcedOverLimit, setAnnouncedOverLimit] = useState(false);
  const isOverLimit = counter?.isOverLimit ?? false;
  let liveAnnouncement = "";
  if (isOverLimit !== announcedOverLimit) {
    setAnnouncedOverLimit(isOverLimit);
    liveAnnouncement = isOverLimit
      ? `Character limit exceeded: ${counter?.count} of ${counter?.max} code points`
      : "Character count within limit";
  }

  const handleCommit = () => {
    if (draft !== value) {
      onCommit(draft);
    }
  };

  const handleRevert = () => {
    setDraft(value);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (e.key === "Escape") {
      e.preventDefault();
      handleRevert();
    } else if (!multiline && e.key === "Enter") {
      e.preventDefault();
      handleCommit();
    } else if (multiline && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleCommit();
    }
  };

  const hasError = liveProblems.length > 0 || (counter?.isOverLimit ?? false);

  return (
    <div className="field-group">
      <div className="field-header">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        {counter && (
          <span
            className={`counter-badge ${counter.isOverLimit ? "counter-over" : ""}`}
            aria-hidden="true"
          >
            {counter.count.toLocaleString()} / {counter.max.toLocaleString()}
          </span>
        )}
      </div>

      {multiline ? (
        <textarea
          id={id}
          className={`field-textarea ${hasError ? "has-error" : ""}`}
          rows={rows}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <input
          id={id}
          type="text"
          className={`field-input ${hasError ? "has-error" : ""}`}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
        />
      )}

      {liveAnnouncement !== "" && (
        <div className="sr-only" role="status" aria-live="polite">
          {liveAnnouncement}
        </div>
      )}

      {liveProblems.length > 0 && (
        <div className="live-problems" role="alert">
          {liveProblems.map((prob, idx) => {
            const before = draft.slice(0, prob.start);
            const highlighted = draft.slice(prob.start, prob.end);
            const after = draft.slice(prob.end);

            return (
              <div key={idx} className="problem-item">
                <div className="problem-header">
                  <span className={`problem-tag tag-${prob.kind}`}>{prob.kind}</span>
                  <span className="problem-message">{prob.message}</span>
                </div>
                <div className="snippet-box">
                  <code>
                    {before}
                    <mark className="span-highlight">{highlighted || " "}</mark>
                    {after}
                  </code>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
