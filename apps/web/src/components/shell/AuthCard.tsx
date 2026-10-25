import React, { useState, useMemo, useEffect } from "react";
import { Link } from "../../router/Link.js";
import { navigate } from "../../router/router.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { getApiBaseUrl } from "../../api/config.js";
import { runAuthLogin, runAuthRegister } from "../../cloud/outcomes.js";
import type { AuthOutcome } from "../../cloud/types.js";

export interface AuthCardProps {
  mode: "login" | "register";
  client?: ApiClient;
  onSuccess?: () => void;
  initialEmail?: string;
}

/**
 * Basic ASCII and email structure check matching backend rules.
 */
export function isValidEmail(email: string): boolean {
  if (email.length < 3 || email.length > 254) {
    return false;
  }
  // ASCII only check matching server regex
  if (!/^[\x00-\x7F]*$/.test(email)) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Counts Unicode code points matching server Array.from(raw).length password validation.
 */
export function countCodePoints(str: string): number {
  return Array.from(str).length;
}

/**
 * Pure client-side email field validator.
 */
export function validateEmailField(email: string): string | undefined {
  const trimmed = email.trim();
  if (!trimmed) {
    return "Email is required";
  }
  if (!isValidEmail(trimmed)) {
    return "Please enter a valid email address";
  }
  return undefined;
}

/**
 * Pure client-side password field validator.
 */
export function validatePasswordField(
  password: string,
  mode: "login" | "register",
): string | undefined {
  if (!password) {
    return "Password is required";
  }
  if (mode === "register") {
    const codePoints = countCodePoints(password);
    if (codePoints < 10) {
      return "Password must be at least 10 characters";
    }
    if (codePoints > 128) {
      return "Password must not exceed 128 characters";
    }
  }
  return undefined;
}

/**
 * Maps an AuthOutcome to a user-facing error message.
 */
export function formatAuthOutcomeError(
  outcome: AuthOutcome,
  mode: "login" | "register",
): string {
  if (outcome.kind === "signed-in") {
    return "";
  }
  if (outcome.kind === "invalid-credentials") {
    return "Invalid email or password";
  }
  if (outcome.kind === "email-taken") {
    return "Email is already registered. Please sign in or use another email.";
  }
  if (outcome.kind === "rate-limited") {
    const secs = outcome.retryAfterSeconds;
    if (mode === "login") {
      return secs
        ? `Too many failed login attempts. Please wait ${secs}s before trying again.`
        : "Too many failed login attempts. Please wait before trying again.";
    }
    return secs
      ? `Too many registration attempts. Please wait ${secs}s before trying again.`
      : "Too many registration attempts. Please wait before trying again.";
  }
  if (outcome.kind === "network") {
    return "Network error: Unable to reach the server. Please check your connection.";
  }
  if (outcome.kind === "timeout") {
    return "Request timed out. Please try again.";
  }
  if (outcome.kind === "invalid-request") {
    const detail = outcome.details?.map((d) => `${d.path}: ${d.message}`).join(", ");
    if (detail) {
      return `Invalid request: ${detail}`;
    }
    return mode === "register"
      ? "Password must be between 10 and 128 characters"
      : "Invalid email or password format";
  }
  if (outcome.kind === "error") {
    return outcome.message;
  }
  return mode === "login"
    ? "Sign in failed. Please try again."
    : "Registration failed. Please try again.";
}

export const AuthCard: React.FC<AuthCardProps> = ({
  mode,
  client: injectedClient,
  onSuccess,
  initialEmail = "",
}) => {
  const isLogin = mode === "login";
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const client = useMemo(() => {
    return injectedClient ?? createApiClient({ baseUrl: getApiBaseUrl() });
  }, [injectedClient]);

  // Clean password on unmount to prevent sensitive data lingering in memory
  useEffect(() => {
    return () => {
      setPassword("");
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isPending) return;

    const trimmedEmail = email.trim();
    const newFieldErrors: { email?: string; password?: string } = {};

    const emailErr = validateEmailField(trimmedEmail);
    if (emailErr) newFieldErrors.email = emailErr;

    const passwordErr = validatePasswordField(password, mode);
    if (passwordErr) newFieldErrors.password = passwordErr;

    if (newFieldErrors.email || newFieldErrors.password) {
      setFieldErrors(newFieldErrors);
      setServerError(null);
      return;
    }

    setFieldErrors({});
    setServerError(null);
    setIsPending(true);

    const enteredEmail = trimmedEmail;
    const enteredPassword = password;
    // Wipe password state immediately upon capture for request
    setPassword("");

    try {
      if (isLogin) {
        const outcome = await runAuthLogin({
          client,
          email: enteredEmail,
          password: enteredPassword,
        });

        if (outcome.kind === "signed-in") {
          if (onSuccess) {
            onSuccess();
          } else {
            navigate("/dashboard");
          }
          return;
        }

        setServerError(formatAuthOutcomeError(outcome, "login"));
      } else {
        const outcome = await runAuthRegister({
          client,
          email: enteredEmail,
          password: enteredPassword,
        });

        if (outcome.kind === "signed-in") {
          if (onSuccess) {
            onSuccess();
          } else {
            navigate("/dashboard");
          }
          return;
        }

        setServerError(formatAuthOutcomeError(outcome, "register"));
      }
    } finally {
      setIsPending(false);
    }
  };

  const emailInputId = isLogin ? "login-email" : "register-email";
  const passwordInputId = isLogin ? "login-password" : "register-password";
  const emailErrorId = `${emailInputId}-error`;
  const passwordErrorId = `${passwordInputId}-error`;
  const passwordHintId = `${passwordInputId}-hint`;

  return (
    <main className="shell-main auth-page" id="main-content">
      <div className="auth-card">
        <header className="auth-header">
          <div className="auth-kicker">
            <span className="auth-brand-logo">◆</span> Lumio Narrative Engineering
          </div>
          <h1 className="auth-title">
            {isLogin ? "Sign In to Lumio" : "Create a Lumio Account"}
          </h1>
          <p className="auth-subtitle">
            {isLogin
              ? "Access your branching stories, diagnostics workbench, and simulation history."
              : "Architect complex game stories with mathematical consistency and static analysis."}
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

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor={emailInputId} className="auth-label">
              Email Address
            </label>
            <div className="auth-input-wrapper">
              <input
                id={emailInputId}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }
                }}
                autoComplete="email"
                required
                disabled={isPending}
                placeholder="writer@example.com"
                className={`auth-input ${fieldErrors.email ? "is-invalid" : ""}`}
                aria-invalid={fieldErrors.email ? "true" : undefined}
                aria-describedby={fieldErrors.email ? emailErrorId : undefined}
              />
            </div>
            {fieldErrors.email && (
              <div id={emailErrorId} className="auth-field-error" role="alert" aria-live="polite">
                {fieldErrors.email}
              </div>
            )}
          </div>

          <div className="auth-field">
            <label htmlFor={passwordInputId} className="auth-label">
              <span>Password</span>
            </label>
            <div className="auth-input-wrapper">
              <input
                id={passwordInputId}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }
                }}
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                disabled={isPending}
                placeholder={isLogin ? "Enter your password" : "At least 10 characters"}
                className={`auth-input ${fieldErrors.password ? "is-invalid" : ""}`}
                aria-invalid={fieldErrors.password ? "true" : undefined}
                aria-describedby={
                  fieldErrors.password
                    ? passwordErrorId
                    : !isLogin
                    ? passwordHintId
                    : undefined
                }
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={isPending}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {!isLogin && !fieldErrors.password && (
              <div id={passwordHintId} className="auth-field-hint">
                Must be between 10 and 128 characters
              </div>
            )}
            {fieldErrors.password && (
              <div
                id={passwordErrorId}
                className="auth-field-error"
                role="alert"
                aria-live="polite"
              >
                {fieldErrors.password}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="shell-btn-primary auth-submit-btn"
            disabled={isPending}
          >
            {isPending
              ? isLogin
                ? "Signing in…"
                : "Creating account…"
              : isLogin
              ? "Sign In"
              : "Create Account"}
          </button>
        </form>

        <footer className="auth-card-footer">
          <p className="auth-switch-prompt">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <Link
              href={isLogin ? "/register" : "/login"}
              className="auth-link"
            >
              {isLogin ? "Create one →" : "Sign in →"}
            </Link>
          </p>
          <div className="auth-back-container">
            <Link href="/" className="auth-back-link">
              ← Return to Home
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
};
