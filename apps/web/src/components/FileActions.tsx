import React, { useRef, useState, useEffect } from "react";

export interface FileActionsProps {
  onNew: () => void;
  onOpen: (file: File) => void;
  onSave: () => void;
  onSaveCloud: () => void;
  onOpenCloud: () => void;
  onOpenHistory?: () => void;
  isHistoryEnabled?: boolean;
  historyTitle?: string;
  disabled?: boolean;
  onReset?: () => void;
}

export const FileActions: React.FC<FileActionsProps> = ({
  onNew,
  onOpen,
  onSave,
  onOpenCloud,
  onOpenHistory,
  isHistoryEnabled = false,
  historyTitle,
  disabled = false,
  onReset,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenClick = () => {
    setIsOpen(false);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onOpen(file);
    }
    e.target.value = "";
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="dropdown-menu-wrapper file-actions" ref={menuRef}>
      <button
        type="button"
        className="btn btn-secondary dropdown-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="true"
        title="Story and project file operations"
      >
        <span>Story</span>
        <span className="dropdown-caret" aria-hidden="true">▾</span>
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

      {isOpen && (
        <div className="dropdown-menu" role="menu" aria-label="Story operations">
          <button
            type="button"
            className="dropdown-menu-item"
            onClick={() => {
              setIsOpen(false);
              onNew();
            }}
          >
            <span>+ New Story</span>
          </button>

          <button
            type="button"
            className="dropdown-menu-item"
            onClick={() => {
              setIsOpen(false);
              onOpenCloud();
            }}
          >
            <span>Browse Cloud Stories…</span>
          </button>

          {onOpenHistory && (
            <button
              type="button"
              className="dropdown-menu-item"
              onClick={() => {
                setIsOpen(false);
                onOpenHistory();
              }}
              disabled={!isHistoryEnabled}
              title={historyTitle || "View version history"}
            >
              <span>Version History…</span>
            </button>
          )}

          <div className="dropdown-menu-divider" role="separator" />
          <div className="dropdown-menu-header">File Backup</div>

          <button
            type="button"
            className="dropdown-menu-item"
            onClick={() => {
              setIsOpen(false);
              onSave();
            }}
            title="Download current story as JSON file"
          >
            <span>Export JSON File…</span>
          </button>

          <button
            type="button"
            className="dropdown-menu-item"
            onClick={handleOpenClick}
            title="Open story from local JSON file"
          >
            <span>Import JSON File…</span>
          </button>

          {onReset && (
            <>
              <div className="dropdown-menu-divider" role="separator" />
              <button
                type="button"
                className="dropdown-menu-item danger"
                onClick={() => {
                  setIsOpen(false);
                  onReset();
                }}
                title="Reset active story to default tutorial sample"
              >
                <span>Load Sample Story</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
