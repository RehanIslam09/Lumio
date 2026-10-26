import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppHeader, getAvatarInitial } from "./AppHeader.js";
import type { UserDto } from "../../api/types.js";
import type { Route } from "../../router/types.js";

const mockUser: UserDto = {
  id: "user-123",
  email: "narrative.designer@lumio.dev",
};

describe("AppHeader Component (W-045)", () => {
  describe("1. Anonymous Navigation", () => {
    it("renders Sign In and Get Started links when unauthenticated", () => {
      const route: Route = { kind: "landing" };
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: route,
          user: null,
          skipAutoFetch: true,
        }),
      );

      expect(html).toContain("Sign In");
      expect(html).toContain('href="/login"');
      expect(html).toContain("Get Started");
      expect(html).toContain('href="/register"');
      expect(html).not.toContain("narrative.designer@lumio.dev");
      expect(html).not.toContain("shell-avatar-btn");
    });

    it("highlights active route for landing, login, and register", () => {
      const loginHtml = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: { kind: "login" },
          user: null,
          skipAutoFetch: true,
        }),
      );
      expect(loginHtml).toContain('class="shell-auth-link is-active"');
      expect(loginHtml).toContain('aria-current="page"');

      const registerHtml = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: { kind: "register" },
          user: null,
          skipAutoFetch: true,
        }),
      );
      expect(registerHtml).toContain('aria-current="page"');

      const landingHtml = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: { kind: "landing" },
          user: null,
          skipAutoFetch: true,
        }),
      );
      expect(landingHtml).toContain('class="shell-nav-link is-active"');
      expect(landingHtml).toContain('aria-current="page"');
    });
  });

  describe("2. Authenticated Navigation & User Identity", () => {
    it("renders user avatar button with initial letter and menu attributes", () => {
      const route: Route = { kind: "landing" };
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: route,
          user: mockUser,
          skipAutoFetch: true,
        }),
      );

      expect(html).toContain('class="shell-avatar-btn"');
      expect(html).toContain('aria-haspopup="menu"');
      expect(html).toContain('aria-label="User account menu"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain("N"); // First letter of narrative.designer
      expect(html).toContain("shell-user-pill");
      expect(html).toContain('href="/dashboard"');
      // Must NOT present contradictory anonymous sign-in navigation
      expect(html).not.toContain("Sign In");
      expect(html).not.toContain("Get Started");
    });

    it("handles authenticated user with empty or minimal email gracefully", () => {
      const minimalUser: UserDto = { id: "u-min", email: "user@test.org" };
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: { kind: "landing" },
          user: minimalUser,
          skipAutoFetch: true,
        }),
      );

      expect(html).toContain("user@test.org");
      expect(html).toContain("U");
      expect(html).toContain('href="/dashboard"');
    });

    it("displays clean navigation when user is on dashboard route", () => {
      const route: Route = { kind: "dashboard" };
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: route,
          user: mockUser,
          skipAutoFetch: true,
        }),
      );

      expect(html).toContain("narrative.designer@lumio.dev");
      expect(html).toContain('class="shell-nav-link is-active"');
      expect(html).toContain("Stories");
    });

    it("renders Editor Dev route with active state when on editor route", () => {
      const route: Route = { kind: "editor" };
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: route,
          user: mockUser,
          skipAutoFetch: true,
        }),
      );

      expect(html).toContain("shell-nav-editor is-active");
      expect(html).toContain('aria-current="page"');
      expect(html).toContain("Dev");
    });

    it("hides Editor Dev navigation item when in production mode (isDevEnv: false)", () => {
      const route: Route = { kind: "landing" };
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: route,
          user: mockUser,
          skipAutoFetch: true,
          isDevEnv: false,
        }),
      );

      expect(html).not.toContain("shell-nav-editor");
      expect(html).not.toContain("shell-nav-pill");
    });

    it("shows Editor Dev navigation item when in development mode (isDevEnv: true)", () => {
      const route: Route = { kind: "landing" };
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: route,
          user: mockUser,
          skipAutoFetch: true,
          isDevEnv: true,
        }),
      );

      expect(html).toContain("shell-nav-editor");
      expect(html).toContain("shell-nav-pill");
      expect(html).toContain("Dev");
    });
  });

  describe("3. Avatar Dropdown Menu & Interactions", () => {
    it("renders closed dropdown menu by default without menu popup", () => {
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: { kind: "landing" },
          user: mockUser,
          skipAutoFetch: true,
          initialAvatarMenuOpen: false,
        }),
      );

      expect(html).toContain('aria-expanded="false"');
      expect(html).not.toContain('class="shell-dropdown-menu"');
    });

    it("renders accessible open dropdown menu with user identity and options when open", () => {
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: { kind: "dashboard" },
          user: mockUser,
          skipAutoFetch: true,
          initialAvatarMenuOpen: true,
        }),
      );

      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain('class="shell-dropdown-menu"');
      expect(html).toContain('role="menu"');
      expect(html).toContain("Signed in as");
      expect(html).toContain("narrative.designer@lumio.dev");
      expect(html).toContain("Landing page");
      expect(html).toContain("Stories");
      expect(html).toContain("Editor");
      expect(html).toContain("Sign out");
      expect(html).toContain('role="menuitem"');
      expect(html).toContain('role="separator"');
    });
  });

  describe("4. Pure Helper: getAvatarInitial", () => {
    it("extracts uppercase initial from email correctly", () => {
      expect(getAvatarInitial({ id: "1", email: "rehan@lumio.dev" })).toBe("R");
      expect(getAvatarInitial({ id: "2", email: "author@test.com" })).toBe("A");
      expect(getAvatarInitial({ id: "3", email: "  writer@lumio.org  " })).toBe("W");
    });

    it("handles empty email or missing user gracefully without throwing", () => {
      expect(getAvatarInitial(null)).toBe("");
      expect(getAvatarInitial(undefined)).toBe("");
      expect(getAvatarInitial({ id: "4", email: "" })).toBe("");
      expect(getAvatarInitial({ id: "5", email: "   " })).toBe("");
    });
  });

  describe("5. Brand & Landmark Structure", () => {
    it("renders exactly one banner landmark and Lumio brand logo linking to home", () => {
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: { kind: "landing" },
          user: null,
          skipAutoFetch: true,
        }),
      );

      const bannerMatches = html.match(/role="banner"/g);
      expect(bannerMatches).toBeDefined();
      expect(bannerMatches?.length).toBe(1);

      expect(html).toContain('href="/"');
      expect(html).toContain("Lumio");
    });

    it("renders consistent unified nav links: Landing, Stories, and Editor across routes", () => {
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: { kind: "landing" },
          user: null,
          skipAutoFetch: true,
        }),
      );

      expect(html).toContain("Landing");
      expect(html).toContain("Stories");
      expect(html).toContain("Editor");
      expect(html).toContain('href="/"');
      expect(html).toContain('href="/dashboard"');
      expect(html).toContain('href="/editor"');
    });

    it("renders cleanly on project workspace route without duplicate landmarks", () => {
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          currentRoute: { kind: "project", projectId: "proj-123" },
          user: mockUser,
          skipAutoFetch: true,
        }),
      );

      const bannerMatches = html.match(/role="banner"/g);
      expect(bannerMatches?.length).toBe(1);
      expect(html).toContain("Stories");
      expect(html).toContain('href="/dashboard"');
    });
  });
});
