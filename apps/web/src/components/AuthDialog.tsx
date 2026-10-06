import React, { useState, useEffect, useRef } from "react";
import type { ApiClient } from "../api/client.js";
import type { UserDto } from "../api/types.js";
import { runAuthLogin, runAuthRegister } from "../cloud/outcomes.js";

export interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserDto) => void;
  client: ApiClient;
  notice?: string | null;
}

export const AuthDialog: React.FC<AuthDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
  client,
  notice,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"signIn" | "register">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const handleClose = () => {
    setPassword("");
    setErrorMessage(null);
    onClose();
  };

  // Handle native cancel (Esc key)
  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    if (!isPending) {
      handleClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;

    setIsPending(true);
    setErrorMessage(null);

    const enteredEmail = email.trim();
    const enteredPassword = password;
    // Clear password state immediately after capturing for request
    setPassword("");

    try {
      if (mode === "signIn") {
        const outcome = await runAuthLogin({
          client,
          email: enteredEmail,
          password: enteredPassword,
        });

        if (outcome.kind === "signed-in") {
          onSuccess(outcome.user);
          onClose();
        } else if (outcome.kind === "invalid-credentials") {
          setErrorMessage("Invalid email or password");
        } else if (outcome.kind === "rate-limited") {
          const secs = outcome.retryAfterSeconds;
          setErrorMessage(
            secs
              ? `Too many failed login attempts. Please wait ${secs}s before trying again.`
              : "Too many failed login attempts. Please wait before trying again.",
          );
        } else if (outcome.kind === "network") {
          setErrorMessage("Network error: Unable to reach the server");
        } else if (outcome.kind === "timeout") {
          setErrorMessage("Request timed out. Please try again.");
        } else if (outcome.kind === "invalid-request") {
          const detailMsg = outcome.details?.map((d) => `${d.path}: ${d.message}`).join("\n");
          setErrorMessage(detailMsg ? `Invalid request: ${detailMsg}` : "Invalid email or password format");
        } else if (outcome.kind === "error") {
          setErrorMessage(outcome.message);
        } else {
          setErrorMessage("Sign in failed");
        }
      } else {
        const outcome = await runAuthRegister({
          client,
          email: enteredEmail,
          password: enteredPassword,
        });

        if (outcome.kind === "signed-in") {
          onSuccess(outcome.user);
          onClose();
        } else if (outcome.kind === "email-taken") {
          setErrorMessage("Email is already registered");
        } else if (outcome.kind === "rate-limited") {
          const secs = outcome.retryAfterSeconds;
          setErrorMessage(
            secs
              ? `Too many registration attempts. Please wait ${secs}s before trying again.`
              : "Too many registration attempts. Please wait before trying again.",
          );
        } else if (outcome.kind === "network") {
          setErrorMessage("Network error: Unable to reach the server");
        } else if (outcome.kind === "timeout") {
          setErrorMessage("Request timed out. Please try again.");
        } else if (outcome.kind === "invalid-request") {
          const detailMsg = outcome.details?.map((d) => `${d.path}: ${d.message}`).join("\n");
          setErrorMessage(detailMsg ? `Invalid request: ${detailMsg}` : "Password must be at least 10 characters");
        } else if (outcome.kind === "error") {
          setErrorMessage(outcome.message);
        } else {
          setErrorMessage("Registration failed");
        }
      }
    } finally {
      setIsPending(false);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === "signIn" ? "register" : "signIn"));
    setErrorMessage(null);
    setPassword("");
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog auth-dialog"
      onCancel={handleCancel}
      aria-labelledby="auth-dialog-title"
    >
      <div className="dialog-content">
        <h2 id="auth-dialog-title" className="dialog-title">
          {mode === "signIn" ? "Sign in to Lumio" : "Create Lumio account"}
        </h2>

        {notice && <p className="dialog-notice">{notice}</p>}

        <form onSubmit={handleSubmit} className="dialog-form" noValidate>
          <div className="form-group">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={isPending}
              placeholder="writer@example.com"
              className="dialog-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              required
              disabled={isPending}
              placeholder={mode === "register" ? "At least 10 characters" : ""}
              className="dialog-input"
            />
          </div>

          <div
            className="dialog-error"
            role="status"
            aria-live="polite"
            style={{ display: errorMessage ? "block" : "none" }}
          >
            {errorMessage}
          </div>

          <div className="dialog-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={toggleMode}
              disabled={isPending}
            >
              {mode === "signIn" ? "Need an account? Register" : "Already have an account? Sign in"}
            </button>

            <div className="button-group">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isPending}
              >
                {isPending
                  ? "Submitting…"
                  : mode === "signIn"
                  ? "Sign in"
                  : "Create account"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </dialog>
  );
};
