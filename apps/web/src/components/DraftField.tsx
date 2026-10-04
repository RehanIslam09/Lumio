import React, { useState } from "react";
import type { DraftProblem } from "../lib/draftCheck.js";

interface DraftFieldProps {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  onCommit: (nextValue: string) => void;
  checkDraft?: (draft: string) => { status: "empty" | "ok" | "error"; problems: DraftProblem[] };
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
}) => {
  const [draft, setDraft] = useState(value);
  const [prevValue, setPrevValue] = useState(value);

  // Sync draft when external value changes (e.g. undo/redo or selection switch)
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }

  const liveProblems = checkDraft ? checkDraft(draft).problems : [];

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

  return (
    <div className="field-group">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          className={`field-textarea ${liveProblems.length > 0 ? "has-error" : ""}`}
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
          className={`field-input ${liveProblems.length > 0 ? "has-error" : ""}`}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
        />
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
