import React from "react";

interface MessageBarProps {
  message: string | null;
  onDismiss: () => void;
}

export const MessageBar: React.FC<MessageBarProps> = ({ message, onDismiss }) => {
  if (!message) return null;

  return (
    <aside
      className="message-bar"
      role="status"
      aria-live="polite"
      aria-label="Editor error notification"
    >
      <div className="message-bar-content">
        <span className="message-bar-icon" aria-hidden="true">
          ⚠️
        </span>
        <span className="message-bar-text">{message}</span>
      </div>
      <button
        type="button"
        className="message-bar-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss error message"
      >
        ×
      </button>
    </aside>
  );
};
