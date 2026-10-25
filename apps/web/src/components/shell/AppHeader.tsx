import React from "react";
import { Link } from "../../router/Link.js";
import type { Route } from "../../router/types.js";

export interface AppHeaderProps {
  currentRoute: Route;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ currentRoute }) => {
  const isLandingActive = currentRoute.kind === "landing";
  const isDashboardActive = currentRoute.kind === "dashboard";
  const isEditorActive = currentRoute.kind === "editor";
  const isLoginActive = currentRoute.kind === "login";
  const isRegisterActive = currentRoute.kind === "register";

  return (
    <header className="shell-header" role="banner">
      <div className="shell-header-inner">
        <div className="shell-brand-group">
          <Link href="/" className="shell-brand-link">
            <span className="shell-brand-logo">◆</span>
            <span className="shell-brand-text">Lumio</span>
          </Link>
          <span className="shell-badge">Product Foundation</span>
        </div>

        <nav className="shell-nav" aria-label="Main Navigation">
          <ul className="shell-nav-list">
            <li className="shell-nav-item">
              <Link
                href="/"
                className={`shell-nav-link ${isLandingActive ? "is-active" : ""}`}
                aria-current={isLandingActive ? "page" : undefined}
              >
                Landing
              </Link>
            </li>
            <li className="shell-nav-item">
              <Link
                href="/dashboard"
                className={`shell-nav-link ${isDashboardActive ? "is-active" : ""}`}
                aria-current={isDashboardActive ? "page" : undefined}
              >
                Dashboard
              </Link>
            </li>
            <li className="shell-nav-item">
              <Link
                href="/editor"
                className={`shell-nav-link shell-nav-editor ${isEditorActive ? "is-active" : ""}`}
                aria-current={isEditorActive ? "page" : undefined}
              >
                <span>Editor</span>
                <span className="shell-nav-pill">Dev</span>
              </Link>
            </li>
          </ul>
        </nav>

        <div className="shell-auth-group">
          <Link
            href="/login"
            className={`shell-auth-link ${isLoginActive ? "is-active" : ""}`}
            aria-current={isLoginActive ? "page" : undefined}
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className={`shell-btn-primary ${isRegisterActive ? "is-active" : ""}`}
            aria-current={isRegisterActive ? "page" : undefined}
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
};
