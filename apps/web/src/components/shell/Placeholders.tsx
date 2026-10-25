import React from "react";
import { Link } from "../../router/Link.js";

export const LandingPlaceholder: React.FC = () => {
  return (
    <main className="shell-main placeholder-page" id="main-content">
      <div className="placeholder-hero">
        <span className="placeholder-kicker">Branching Narrative Engine</span>
        <h1 className="placeholder-title">
          Architect complex game stories with mathematical consistency.
        </h1>
        <p className="placeholder-description">
          Lumio combines visual flow authoring, a deterministic story diagnostics checker,
          pure DSL typechecking, live playtesting, and Monte Carlo simulation into a single
          narrative engineering workbench.
        </p>

        <div className="placeholder-actions">
          <Link href="/editor" className="shell-btn-primary">
            Launch Development Editor →
          </Link>
          <Link href="/dashboard" className="shell-btn-secondary">
            View Story Dashboard
          </Link>
        </div>

        <div className="placeholder-callout" role="note">
          <strong>Architecture Note:</strong> Full marketing landing page and product showcase
          are scheduled for implementation in <strong>W-034</strong>. The development editor is fully
          functional and accessible via the button above.
        </div>
      </div>
    </main>
  );
};

export const DashboardPlaceholder: React.FC = () => {
  return (
    <main className="shell-main placeholder-page" id="main-content">
      <div className="placeholder-card">
        <div className="placeholder-card-header">
          <span className="placeholder-tag">Phase 4 Placeholder</span>
          <h1 className="placeholder-card-title">Story Dashboard</h1>
        </div>
        <p className="placeholder-card-text">
          A centralized project hub featuring story cards, last-edited timestamps,
          diagnostic health indicators, and project creation/deletion will be implemented in{" "}
          <strong>W-036</strong>.
        </p>
        <p className="placeholder-card-subtext">
          No project cards or mock story metrics are fabricated in this routing foundation.
          To author and inspect stories today, use the development editor.
        </p>
        <div className="placeholder-actions">
          <Link href="/editor" className="shell-btn-primary">
            Open Development Editor
          </Link>
          <Link href="/" className="shell-btn-secondary">
            Return to Landing
          </Link>
        </div>
      </div>
    </main>
  );
};

export const AuthPlaceholder: React.FC<{ mode: "login" | "register" }> = ({ mode }) => {
  const isLogin = mode === "login";
  return (
    <main className="shell-main placeholder-page" id="main-content">
      <div className="placeholder-card">
        <div className="placeholder-card-header">
          <span className="placeholder-tag">Phase 3 Placeholder</span>
          <h1 className="placeholder-card-title">
            {isLogin ? "Sign In to Lumio" : "Create a Lumio Account"}
          </h1>
        </div>
        <p className="placeholder-card-text">
          Dedicated full-page authentication forms with client validation, field-level error
          mapping, and protected session routing will be implemented in <strong>W-035</strong>.
        </p>
        <p className="placeholder-card-subtext">
          The backend authentication API (Argon2id hashing, httpOnly session cookies, CSRF protection,
          and sliding-window rate limiting) is already fully implemented and verified. In the meantime,
          authentication can be tested interactively via the "Account" modal inside the editor.
        </p>
        <div className="placeholder-actions">
          <Link href="/editor" className="shell-btn-primary">
            Open Editor (Test Account Modal)
          </Link>
          <Link href={isLogin ? "/register" : "/login"} className="shell-btn-secondary">
            Switch to {isLogin ? "Register" : "Sign In"}
          </Link>
          <Link href="/" className="shell-btn-secondary">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
};

export const ProjectWorkspacePlaceholder: React.FC<{ projectId: string }> = ({ projectId }) => {
  return (
    <main className="shell-main placeholder-page" id="main-content">
      <div className="placeholder-card placeholder-project-card">
        <div className="placeholder-card-header">
          <span className="placeholder-tag tag-accent">Phase 5 Placeholder</span>
          <h1 className="placeholder-card-title">Project Workspace</h1>
        </div>

        <div className="placeholder-meta-row">
          <span className="meta-label">Route Parameter:</span>
          <code className="meta-code">{projectId}</code>
        </div>

        <div className="placeholder-alert" role="status">
          <strong>Rehydration Scheduled for W-037:</strong> This URL recognizes project ID{" "}
          <code>{projectId}</code>. In accordance with task constraints, document fetching and
          state rehydration from PostgreSQL are deferred to <strong>W-037</strong>. This page
          honestly reflects that story data has not yet been loaded from the server.
        </div>

        <p className="placeholder-card-text">
          To author stories, test graph connectivity, run diagnostics, and simulate narratives right
          now, please use the development editor.
        </p>

        <div className="placeholder-actions">
          <Link href="/editor" className="shell-btn-primary">
            Open Development Editor
          </Link>
          <Link href="/dashboard" className="shell-btn-secondary">
            Back to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
};

export const NotFoundPage: React.FC<{ path: string }> = ({ path }) => {
  return (
    <main className="shell-main placeholder-page" id="main-content">
      <div className="placeholder-card placeholder-404">
        <div className="placeholder-card-header">
          <span className="placeholder-tag tag-error">404</span>
          <h1 className="placeholder-card-title">Page Not Found</h1>
        </div>
        <p className="placeholder-card-text">
          No application route matches the requested path:
        </p>
        <div className="placeholder-meta-row">
          <code className="meta-code">{path}</code>
        </div>
        <div className="placeholder-actions">
          <Link href="/" className="shell-btn-primary">
            Return to Landing
          </Link>
          <Link href="/dashboard" className="shell-btn-secondary">
            Go to Dashboard
          </Link>
          <Link href="/editor" className="shell-btn-secondary">
            Open Development Editor
          </Link>
        </div>
      </div>
    </main>
  );
};
