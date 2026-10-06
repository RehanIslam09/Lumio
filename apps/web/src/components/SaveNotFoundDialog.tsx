import React, { useEffect, useRef } from "react";

export interface SaveNotFoundDialogProps {
  isOpen: boolean;
  onSaveAsNew: () => void;
  onCancel: () => void;
  context?: "save" | "history";
}

export const SaveNotFoundDialog: React.FC<SaveNotFoundDialogProps> = ({
  isOpen,
  onSaveAsNew,
  onCancel,
  context = "save",
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
      className="modal-dialog not-found-dialog"
      onCancel={handleCancel}
      aria-labelledby="not-found-dialog-title"
    >
      <div className="dialog-content">
        <h2 id="not-found-dialog-title" className="dialog-title">
          Cloud Project Not Found
        </h2>

        <p className="dialog-description">
          {context === "history"
            ? "The cloud project this document was linked to no longer exists (it may have been deleted from another browser session). You can save your current local work as a new cloud project."
            : "The cloud project this document was linked to no longer exists (it may have been deleted from another browser session). Would you like to save it as a new cloud project?"}
        </p>

        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSaveAsNew}
          >
            Save as a new cloud project
          </button>
        </div>
      </div>
    </dialog>
  );
};
