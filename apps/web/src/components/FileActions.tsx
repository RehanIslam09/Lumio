import React, { useRef } from "react";

interface FileActionsProps {
  onNew: () => void;
  onOpen: (file: File) => void;
  onSave: () => void;
}

export const FileActions: React.FC<FileActionsProps> = ({
  onNew,
  onOpen,
  onSave,
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
        title="Create a new story project"
      >
        New
      </button>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={handleOpenClick}
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
    </div>
  );
};
