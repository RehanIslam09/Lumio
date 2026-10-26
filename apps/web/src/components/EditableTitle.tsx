import React, { useState, useRef, useEffect } from "react";
import {
  TITLE_MAX,
  titleCounterState,
  validateTitleCommit,
} from "./titleHelper.js";

export interface EditableTitleProps {
  name: string;
  onRename: (newName: string) => void;
  initialEditMode?: boolean;
}

export const EditableTitle: React.FC<EditableTitleProps> = ({
  name,
  onRename,
  initialEditMode = false,
}) => {
  const [isEditing, setIsEditing] = useState(initialEditMode);
  const [draft, setDraft] = useState(name);
  const [prevName, setPrevName] = useState(name);
  // Fixed for the entire edit session: max(TITLE_MAX, originalTitle.length)
  const [editLimit, setEditLimit] = useState(() => Math.max(TITLE_MAX, name.length));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDismissingViaKeyboardRef = useRef(false);

  // Synchronize draft when external project name updates (undo/redo/reset/file load)
  if (name !== prevName) {
    setPrevName(name);
    setDraft(name);
    if (!isEditing) {
      setEditLimit(Math.max(TITLE_MAX, name.length));
    }
  }

  // When entering edit mode, focus and select all text
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const startEdit = () => {
    setEditLimit(Math.max(TITLE_MAX, name.length));
    setDraft(name);
    setErrorMessage(null);
    isDismissingViaKeyboardRef.current = false;
    setIsEditing(true);
  };

  const handleCommit = (viaKeyboard: boolean) => {
    const res = validateTitleCommit(draft, name);
    if (res.ok) {
      if (res.title !== name) {
        onRename(res.title);
      }
      setErrorMessage(null);
      setIsEditing(false);
      if (viaKeyboard) {
        displayButtonRef.current?.focus();
      }
    } else {
      if (viaKeyboard) {
        // Keep edit mode open and show inline error message
        setErrorMessage(res.reason);
        inputRef.current?.focus();
      } else {
        // Blur with invalid input: revert cleanly to avoid broken state
        setDraft(name);
        setErrorMessage(null);
        setIsEditing(false);
      }
    }
  };

  const handleRevert = () => {
    setDraft(name);
    setErrorMessage(null);
    setIsEditing(false);
    displayButtonRef.current?.focus();
  };

  const counter = titleCounterState(draft.length);
  // Fallback ch calculation for browsers without field-sizing: content
  const chWidth = Math.max(12, Math.min(draft.length + 1, editLimit));

  if (!isEditing) {
    return (
      <button
        ref={displayButtonRef}
        type="button"
        className="header-title-display-btn"
        onClick={startEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "F2") {
            e.preventDefault();
            startEdit();
          }
        }}
        title={name}
        aria-label={`${name}, edit title`}
      >
        <span className="header-title-text">{name}</span>
        <svg
          className="header-title-pencil"
          aria-hidden="true"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </button>
    );
  }

  return (
    <div className="header-title-edit-container">
      <input
        ref={inputRef}
        type="text"
        className={`header-title-input${errorMessage ? " is-invalid" : ""}`}
        value={draft}
        maxLength={editLimit}
        style={{ width: `${chWidth}ch` }}
        onChange={(e) => {
          setDraft(e.target.value);
          if (errorMessage) setErrorMessage(null);
        }}
        onBlur={() => {
          if (!isDismissingViaKeyboardRef.current) {
            handleCommit(false);
          }
        }}
        onKeyDown={(e) => {
          // Prevent bubbling to global editor keymap shortcuts
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            isDismissingViaKeyboardRef.current = true;
            handleRevert();
          } else if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            isDismissingViaKeyboardRef.current = true;
            handleCommit(true);
          } else if (
            (e.ctrlKey || e.metaKey) &&
            (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")
          ) {
            // Keep native input undo/redo, stop canvas undo/redo
            e.stopPropagation();
          }
        }}
        title="Enter to save, Escape to cancel"
        aria-label="Story title"
        aria-invalid={errorMessage ? "true" : undefined}
        aria-describedby={
          errorMessage
            ? "header-title-error"
            : counter.visible
              ? "header-title-counter"
              : undefined
        }
      />

      {counter.visible && (
        <span
          id="header-title-counter"
          className={`header-title-counter tone-${counter.tone}`}
          aria-live="polite"
        >
          {counter.count}/{TITLE_MAX}
        </span>
      )}

      {errorMessage && (
        <div
          id="header-title-error"
          className="header-title-error-tooltip"
          role="alert"
          aria-live="polite"
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
};
