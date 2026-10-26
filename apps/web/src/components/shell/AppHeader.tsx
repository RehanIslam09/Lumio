import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Link } from "../../router/Link.js";
import { navigate } from "../../router/router.js";
import type { Route } from "../../router/types.js";
import type { UserDto } from "../../api/types.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { getApiBaseUrl } from "../../api/config.js";
import { runAuthMe, runAuthLogout } from "../../cloud/outcomes.js";
import { isDevNavVisible } from "./authPresentation.js";

export interface AppHeaderProps {
  currentRoute: Route;
  user?: UserDto | null;
  client?: ApiClient;
  skipAutoFetch?: boolean;
  initialAvatarMenuOpen?: boolean;
  isDevEnv?: boolean;
}

export function getAvatarInitial(user: UserDto | null | undefined): string {
  if (!user || !user.email) return "";
  const trimmed = user.email.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : "";
}

const IconExternal: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" />
    <polyline points="10 2 14 2 14 6" />
    <line x1="7" y1="9" x2="14" y2="2" />
  </svg>
);

const IconStories: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </svg>
);

const IconEditor: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="10 4 14 8 10 12" />
    <polyline points="6 12 2 8 6 4" />
  </svg>
);

const IconLogOut: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 14H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3" />
    <polyline points="11 12 15 8 11 4" />
    <line x1="15" y1="8" x2="5" y2="8" />
  </svg>
);

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentRoute,
  user: propUser,
  client: injectedClient,
  skipAutoFetch = false,
  initialAvatarMenuOpen = false,
  isDevEnv,
}) => {
  const showDevNav = isDevNavVisible(isDevEnv ?? import.meta.env?.DEV);
  const isLandingActive = currentRoute.kind === "landing";
  const isDashboardActive = currentRoute.kind === "dashboard";
  const isEditorActive = currentRoute.kind === "editor";
  const isLoginActive = currentRoute.kind === "login";
  const isRegisterActive = currentRoute.kind === "register";

  const client = useMemo(() => {
    return injectedClient ?? createApiClient({ baseUrl: getApiBaseUrl() });
  }, [injectedClient]);

  const [fetchedUser, setFetchedUser] = useState<UserDto | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(initialAvatarMenuOpen);

  const avatarButtonRef = useRef<HTMLButtonElement>(null);
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // If user was explicitly passed via prop, do not auto-fetch
    if (propUser !== undefined || skipAutoFetch) {
      return;
    }

    let active = true;

    async function checkSession() {
      try {
        const outcome = await runAuthMe({ client });
        if (!active) return;
        if (outcome.kind === "signed-in") {
          setFetchedUser(outcome.user);
        } else {
          setFetchedUser(null);
        }
      } catch {
        if (!active) return;
        setFetchedUser(null);
      }
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, [client, propUser, skipAutoFetch]);

  // Click outside and Escape key handler for avatar menu
  useEffect(() => {
    if (!avatarMenuOpen) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target instanceof Node ? e.target : null;
      if (
        avatarMenuRef.current &&
        !avatarMenuRef.current.contains(target) &&
        !avatarButtonRef.current?.contains(target)
      ) {
        setAvatarMenuOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAvatarMenuOpen(false);
        avatarButtonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [avatarMenuOpen]);

  const handleSignOut = useCallback(async () => {
    try {
      await runAuthLogout({ client });
      setFetchedUser(null);
      setAvatarMenuOpen(false);
      navigate("/login");
    } catch {
      setFetchedUser(null);
      setAvatarMenuOpen(false);
      navigate("/login");
    }
  }, [client]);

  // Prop user takes precedence if explicitly passed, otherwise use fetched session
  const effectiveUser = propUser !== undefined ? propUser : fetchedUser;

  return (
    <header className="shell-header" role="banner">
      <div className="shell-header-inner">
        <div className="shell-header-left">
          <Link href="/" className="shell-brand-link" aria-label="Lumio Home">
            <span className="shell-brand-logo" aria-hidden="true">◆</span>
            <span className="shell-brand-text">Lumio</span>
          </Link>

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
                  Stories
                </Link>
              </li>
              {showDevNav && (
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
              )}
            </ul>
          </nav>
        </div>

        <div className="shell-header-right">
          {effectiveUser ? (
            <div className="shell-avatar-wrapper shell-user-pill">
              <button
                ref={avatarButtonRef}
                type="button"
                className="shell-avatar-btn"
                onClick={() => setAvatarMenuOpen((open) => !open)}
                aria-expanded={avatarMenuOpen}
                aria-haspopup="menu"
                aria-label="User account menu"
                title={`Signed in as ${effectiveUser.email}`}
              >
                <span className="shell-avatar-initial" aria-hidden="true">
                  {getAvatarInitial(effectiveUser)}
                </span>
                <span className="shell-avatar-chevron" aria-hidden="true">▾</span>
              </button>

              {avatarMenuOpen && (
                <div
                  ref={avatarMenuRef}
                  className="shell-dropdown-menu"
                  role="menu"
                  aria-label="Account options"
                >
                  <div className="shell-dropdown-header">
                    <span className="shell-dropdown-label">Signed in as</span>
                    <span className="shell-dropdown-email" title={effectiveUser.email}>
                      {effectiveUser.email}
                    </span>
                  </div>
                  <div className="shell-dropdown-divider" role="separator" />
                  <Link
                    href="/"
                    className="shell-dropdown-item"
                    role="menuitem"
                    onClick={() => setAvatarMenuOpen(false)}
                  >
                    <IconExternal />
                    <span>Landing page</span>
                  </Link>
                  <Link
                    href="/dashboard"
                    className="shell-dropdown-item"
                    role="menuitem"
                    onClick={() => setAvatarMenuOpen(false)}
                  >
                    <IconStories />
                    <span>Stories</span>
                  </Link>
                  <Link
                    href="/editor"
                    className="shell-dropdown-item"
                    role="menuitem"
                    onClick={() => setAvatarMenuOpen(false)}
                  >
                    <IconEditor />
                    <span>Editor</span>
                  </Link>
                  <div className="shell-dropdown-divider" role="separator" />
                  <button
                    type="button"
                    className="shell-dropdown-item item-danger"
                    role="menuitem"
                    onClick={() => void handleSignOut()}
                  >
                    <IconLogOut />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
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
          )}
        </div>
      </div>
    </header>
  );
};
