import React, { useState } from "react";

interface EditableTitleProps {
  name: string;
  onRename: (newName: string) => void;
}

export const EditableTitle: React.FC<EditableTitleProps> = ({ name, onRename }) => {
  const [draft, setDraft] = useState(name);
  const [prevName, setPrevName] = useState(name);

  // Synchronize draft during render when external project name updates (undo/redo/reset)
  if (name !== prevName) {
    setPrevName(name);
    setDraft(name);
  }

  const commit = () => {
    if (draft !== name) {
      onRename(draft);
    }
  };

  const revert = () => {
    setDraft(name);
  };

  return (
    <input
      type="text"
      className="header-title-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          revert();
          e.currentTarget.blur();
        }
      }}
      title="Click to rename project (Enter to commit, Escape to revert)"
      aria-label="Project name"
    />
  );
};
