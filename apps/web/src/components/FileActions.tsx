import React, { useRef } from "react";

interface FileActionsProps {
  onNew: () => void;
  onOpen: (file: File) => void;
  onSave: () => void;
  onSaveCloud: () => void;
  onOpenCloud: () => void;
  onOpenHistory?: () => void;
  isHistoryEnabled?: boolean;
  historyTitle?: string;
  disabled?: boolean;
}

export const FileActions: React.FC<FileActionsProps> = ({
  onNew,
  onOpen,
  onSave,
  onSaveCloud,
  onOpenCloud,
  onOpenHistory,
  isHistoryEnabled = false,
  historyTitle,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onOpen(file);
    }
    // Reset file input value so opening the same file twice triggers onChange
    e.target.value = "";
  };

  return (
    <div className="button-group file-actions" role="group" aria-label="Project file management">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onNew}
        disabled={disabled}
        title="Create a new story project"
      >
        New
      </button>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={handleOpenClick}
        disabled={disabled}
        title="Open a story project from JSON file"
      >
        Open…
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      <button
        type="button"
        className="btn btn-secondary"
        onClick={onSave}
        title="Save current project to a JSON file"
      >
        Save
      </button>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={onSaveCloud}
        disabled={disabled}
        title="Save project to Lumio cloud"
      >
        Save to cloud
      </button>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={onOpenCloud}
        disabled={disabled}
        title="Open a project from Lumio cloud"
      >
        Open from cloud…
      </button>

      {onOpenHistory && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onOpenHistory}
          disabled={!isHistoryEnabled}
          title={historyTitle || "View version history"}
        >
          History
        </button>
      )}
    </div>
  );
};
