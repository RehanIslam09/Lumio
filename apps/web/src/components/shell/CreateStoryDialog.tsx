import React, { useState, useEffect, useRef } from "react";

export interface CreateStoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string) => Promise<{ ok: boolean; error?: string }>;
}

export const CreateStoryDialog: React.FC<CreateStoryDialogProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("Untitled Story");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open && typeof dialog.showModal === "function") {
        dialog.showModal();
      }
      // Focus input on open
      setTimeout(() => inputRef.current?.select(), 50);
    } else {
      if (dialog.open && typeof dialog.close === "function") {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleClose = () => {
    if (isPending) return;
    setTitle("Untitled Story");
    setValidationError(null);
    setServerError(null);
    onClose();
  };

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    handleClose();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isPending) return;

    const trimmed = title.trim();
    if (!trimmed) {
      setValidationError("Story title is required");
      return;
    }
    if (Array.from(trimmed).length > 120) {
      setValidationError("Story title must not exceed 120 characters");
      return;
    }

    setValidationError(null);
    setServerError(null);
    setIsPending(true);

    try {
      const result = await onCreate(trimmed);
      if (!result.ok) {
        setServerError(result.error ?? "Failed to create story");
        setIsPending(false);
      }
      // On success, parent component handles navigation and dialog unmount
    } catch {
      setServerError("Unexpected error occurred while creating story");
      setIsPending(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog dashboard-dialog"
      onCancel={handleCancel}
      aria-labelledby="create-story-dialog-title"
    >
      <div className="dialog-content">
        <header className="dialog-header">
          <span className="dashboard-dialog-badge">New Narrative</span>
          <h2 id="create-story-dialog-title" className="dialog-title">
            Create a New Story
          </h2>
          <p className="dialog-description">
            Initialize a new branching story graph with clean invariants and starter scenes.
          </p>
        </header>

        {serverError && (
          <div className="auth-error-banner" role="alert" aria-live="polite">
            <span className="auth-error-icon" aria-hidden="true">
              ⚠️
            </span>
            <span className="auth-error-text">{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="dialog-form" noValidate>
          <div className="form-group">
            <label htmlFor="create-story-title" className="auth-label">
              Story Title
            </label>
            <input
              ref={inputRef}
              id="create-story-title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (validationError) setValidationError(null);
                if (serverError) setServerError(null);
              }}
              disabled={isPending}
              maxLength={120}
              placeholder="e.g. Prologue: Shadows of Monstadt"
              className={`dialog-input ${validationError ? "is-invalid" : ""}`}
              aria-invalid={validationError ? "true" : undefined}
              aria-describedby={validationError ? "create-story-error" : "create-story-hint"}
              required
            />
            {validationError ? (
              <div
                id="create-story-error"
                className="auth-field-error"
                role="alert"
                aria-live="polite"
              >
                {validationError}
              </div>
            ) : (
              <div id="create-story-hint" className="auth-field-hint">
                Up to 120 characters. You can rename your project at any time.
              </div>
            )}
          </div>

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
              type="submit"
              className="shell-btn-primary"
              disabled={isPending}
            >
              {isPending ? "Creating Story…" : "Create Story →"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
};
