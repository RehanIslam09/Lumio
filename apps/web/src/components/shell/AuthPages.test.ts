import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginPage } from "./LoginPage.js";
import { RegisterPage } from "./RegisterPage.js";
import {
  countCodePoints,
  isValidEmail,
  validateEmailField,
  validatePasswordField,
  formatAuthOutcomeError,
} from "./AuthCard.js";
import { runAuthLogin, runAuthRegister } from "../../cloud/outcomes.js";
import type { ApiClient } from "../../api/client.js";

describe("AuthPages — Dedicated Authentication Pages (W-035)", () => {
  describe("1. Pure Validation Helpers", () => {
    describe("isValidEmail", () => {
      it("accepts valid standard email addresses", () => {
        expect(isValidEmail("writer@example.com")).toBe(true);
        expect(isValidEmail("test.user@lumio.dev")).toBe(true);
        expect(isValidEmail("a@b.co")).toBe(true);
      });

      it("rejects emails shorter than 3 characters or longer than 254", () => {
        expect(isValidEmail("a@")).toBe(false);
        expect(isValidEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
      });

      it("rejects non-ASCII characters per backend contract", () => {
        expect(isValidEmail("user@exämple.com")).toBe(false);
        expect(isValidEmail("लेखक@example.com")).toBe(false);
      });

      it("rejects malformed email structures", () => {
        expect(isValidEmail("plainaddress")).toBe(false);
        expect(isValidEmail("user@domain")).toBe(false);
        expect(isValidEmail("@domain.com")).toBe(false);
        expect(isValidEmail("user@.com")).toBe(false);
        expect(isValidEmail("user @domain.com")).toBe(false);
      });
    });

    describe("validateEmailField", () => {
      it("returns required message for empty or whitespace-only inputs", () => {
        expect(validateEmailField("")).toBe("Email is required");
        expect(validateEmailField("   ")).toBe("Email is required");
      });

      it("returns invalid format message for invalid email", () => {
        expect(validateEmailField("not-an-email")).toBe("Please enter a valid email address");
      });

      it("returns undefined for valid trimmed email", () => {
        expect(validateEmailField(" writer@example.com ")).toBeUndefined();
      });
    });

    describe("countCodePoints & validatePasswordField", () => {
      it("counts ASCII code points accurately", () => {
        expect(countCodePoints("password12")).toBe(10);
        expect(countCodePoints("short")).toBe(5);
      });

      it("counts multi-byte Unicode surrogate pairs (emojis) as single code points", () => {
        // "🎮" is 2 UTF-16 code units, but exactly 1 Unicode code point
        const tenEmojis = "🎮".repeat(10);
        expect(countCodePoints(tenEmojis)).toBe(10);
        expect(validatePasswordField(tenEmojis, "register")).toBeUndefined();

        const nineEmojis = "🎮".repeat(9);
        expect(countCodePoints(nineEmojis)).toBe(9);
        expect(validatePasswordField(nineEmojis, "register")).toBe(
          "Password must be at least 10 characters",
        );
      });

      it("enforces login password requirements (non-empty only)", () => {
        expect(validatePasswordField("", "login")).toBe("Password is required");
        expect(validatePasswordField("short", "login")).toBeUndefined();
        expect(validatePasswordField("validpassword123", "login")).toBeUndefined();
      });

      it("enforces registration password length limits (10..128 code points)", () => {
        expect(validatePasswordField("", "register")).toBe("Password is required");
        expect(validatePasswordField("123456789", "register")).toBe(
          "Password must be at least 10 characters",
        );
        expect(validatePasswordField("1234567890", "register")).toBeUndefined();
        expect(validatePasswordField("a".repeat(128), "register")).toBeUndefined();
        expect(validatePasswordField("a".repeat(129), "register")).toBe(
          "Password must not exceed 128 characters",
        );
      });
    });

    describe("formatAuthOutcomeError", () => {
      it("returns empty string for successful sign-in outcome", () => {
        expect(
          formatAuthOutcomeError(
            { kind: "signed-in", user: { id: "u1", email: "writer@example.com" } },
            "login",
          ),
        ).toBe("");
      });

      it("maps invalid-credentials to friendly non-leaking message", () => {
        expect(
          formatAuthOutcomeError({ kind: "invalid-credentials" }, "login"),
        ).toBe("Invalid email or password");
      });

      it("maps email-taken to actionable guidance", () => {
        expect(formatAuthOutcomeError({ kind: "email-taken" }, "register")).toBe(
          "Email is already registered. Please sign in or use another email.",
        );
      });

      it("maps rate-limited with and without retry duration", () => {
        expect(
          formatAuthOutcomeError(
            { kind: "rate-limited", retryAfterSeconds: 45 },
            "login",
          ),
        ).toBe("Too many failed login attempts. Please wait 45s before trying again.");

        expect(
          formatAuthOutcomeError({ kind: "rate-limited" }, "login"),
        ).toBe("Too many failed login attempts. Please wait before trying again.");

        expect(
          formatAuthOutcomeError(
            { kind: "rate-limited", retryAfterSeconds: 120 },
            "register",
          ),
        ).toBe("Too many registration attempts. Please wait 120s before trying again.");
      });

      it("maps network and timeout errors", () => {
        expect(formatAuthOutcomeError({ kind: "network" }, "login")).toBe(
          "Network error: Unable to reach the server. Please check your connection.",
        );
        expect(formatAuthOutcomeError({ kind: "timeout" }, "login")).toBe(
          "Request timed out. Please try again.",
        );
      });

      it("maps invalid-request with details", () => {
        expect(
          formatAuthOutcomeError(
            {
              kind: "invalid-request",
              details: [{ path: "password", message: "Too short" }],
            },
            "register",
          ),
        ).toBe("Invalid request: password: Too short");
      });

      it("maps general error messages", () => {
        expect(
          formatAuthOutcomeError(
            { kind: "error", message: "Database connection failed" },
            "login",
          ),
        ).toBe("Database connection failed");
      });
    });
  });

  describe("2. Markup & Semantic Structure (Static Rendering)", () => {
    it("LoginPage renders a single semantic h1 and main landmark with id='main-content'", () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage, {}));

      expect(html).toContain('id="main-content"');
      expect(html).toContain("shell-main auth-page");
      expect(html).toContain('<h1 class="auth-title">Welcome back</h1>');
      // Assert exactly one h1 tag in markup
      const h1Count = (html.match(/<h1/g) ?? []).length;
      expect(h1Count).toBe(1);
    });

    it("LoginPage renders two-panel desktop layout and product showcase with 9-node graph", () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage, {}));

      expect(html).toContain("auth-layout");
      expect(html).toContain("auth-showcase-panel");
      expect(html).toContain("Branch your story. Test every path.");
      expect(html).toContain("auth-graph-svg");
    });

    it("LoginPage renders email and password fields with matching labels and autocomplete", () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage, {}));

      // Label htmlFor matches input id
      expect(html).toContain('for="login-email"');
      expect(html).toContain('id="login-email"');
      expect(html).toContain('autoComplete="email"');

      expect(html).toContain('for="login-password"');
      expect(html).toContain('id="login-password"');
      expect(html).toContain('type="password"');
      expect(html).toContain('autoComplete="current-password"');
    });

    it("LoginPage renders accessible password visibility toggle button with type='button'", () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage, {}));

      expect(html).toContain('class="auth-password-toggle"');
      expect(html).toContain('aria-label="Show password"');
      expect(html).toContain('aria-pressed="false"');
      expect(html).toContain('type="button"');
    });

    it("LoginPage renders cross-links to /register and landing page /", () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage, {}));

      expect(html).toContain('href="/register"');
      expect(html).toContain("Create an account");
      expect(html).toContain('href="/"');
      expect(html).toContain("Back to home");
    });

    it("RegisterPage renders single semantic h1 and password requirement hint", () => {
      const html = renderToStaticMarkup(React.createElement(RegisterPage, {}));

      expect(html).toContain('<h1 class="auth-title">Create your account</h1>');
      const h1Count = (html.match(/<h1/g) ?? []).length;
      expect(h1Count).toBe(1);

      // Password requirement hint
      expect(html).toContain('id="register-password-hint"');
      expect(html).toContain("At least 10 characters");

      // Register autocomplete
      expect(html).toContain('autoComplete="new-password"');
      expect(html).toContain('for="register-password"');
      expect(html).toContain('id="register-password"');
    });

    it("RegisterPage renders cross-links to /login and landing page /", () => {
      const html = renderToStaticMarkup(React.createElement(RegisterPage, {}));

      expect(html).toContain('href="/login"');
      expect(html).toContain("Sign in");
      expect(html).toContain('href="/"');
      expect(html).toContain("Back to home");
    });
  });

  describe("3. API Client Integration & Outcome Handling", () => {
    it("runAuthLogin handles successful login response", async () => {
      const mockClient: Partial<ApiClient> = {
        login: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          data: { user: { id: "u-123", email: "writer@example.com" } },
        }),
      };

      const outcome = await runAuthLogin({
        client: mockClient as ApiClient,
        email: "writer@example.com",
        password: "secretpassword10",
      });

      expect(outcome).toEqual({
        kind: "signed-in",
        user: { id: "u-123", email: "writer@example.com" },
      });
      expect(mockClient.login).toHaveBeenCalledWith({
        email: "writer@example.com",
        password: "secretpassword10",
      });
    });

    it("runAuthLogin handles invalid credentials (401)", async () => {
      const mockClient: Partial<ApiClient> = {
        login: vi.fn().mockResolvedValue({
          ok: false,
          kind: "http",
          status: 401,
          code: "invalid-credentials",
          message: "Invalid email or password",
        }),
      };

      const outcome = await runAuthLogin({
        client: mockClient as ApiClient,
        email: "writer@example.com",
        password: "wrongpassword",
      });

      expect(outcome).toEqual({ kind: "invalid-credentials" });
    });

    it("runAuthLogin handles rate limiting (429 with Retry-After)", async () => {
      const mockClient: Partial<ApiClient> = {
        login: vi.fn().mockResolvedValue({
          ok: false,
          kind: "http",
          status: 429,
          code: "rate-limited",
          message: "Too many requests",
          retryAfterSeconds: 60,
        }),
      };

      const outcome = await runAuthLogin({
        client: mockClient as ApiClient,
        email: "writer@example.com",
        password: "wrongpassword",
      });

      expect(outcome).toEqual({
        kind: "rate-limited",
        retryAfterSeconds: 60,
      });
    });

    it("runAuthLogin handles network failure", async () => {
      const mockClient: Partial<ApiClient> = {
        login: vi.fn().mockResolvedValue({
          ok: false,
          kind: "network",
          message: "Network error: unable to reach the server",
        }),
      };

      const outcome = await runAuthLogin({
        client: mockClient as ApiClient,
        email: "writer@example.com",
        password: "password123",
      });

      expect(outcome).toEqual({ kind: "network" });
    });

    it("runAuthLogin handles request timeout", async () => {
      const mockClient: Partial<ApiClient> = {
        login: vi.fn().mockResolvedValue({
          ok: false,
          kind: "timeout",
          message: "Request timed out",
        }),
      };

      const outcome = await runAuthLogin({
        client: mockClient as ApiClient,
        email: "writer@example.com",
        password: "password123",
      });

      expect(outcome).toEqual({ kind: "timeout" });
    });

    it("runAuthRegister handles successful registration response (201)", async () => {
      const mockClient: Partial<ApiClient> = {
        register: vi.fn().mockResolvedValue({
          ok: true,
          status: 201,
          data: { user: { id: "u-new", email: "newwriter@example.com" } },
        }),
      };

      const outcome = await runAuthRegister({
        client: mockClient as ApiClient,
        email: "newwriter@example.com",
        password: "securepassword123",
      });

      expect(outcome).toEqual({
        kind: "signed-in",
        user: { id: "u-new", email: "newwriter@example.com" },
      });
      expect(mockClient.register).toHaveBeenCalledWith({
        email: "newwriter@example.com",
        password: "securepassword123",
      });
    });

    it("runAuthRegister handles email conflict (409 email-taken)", async () => {
      const mockClient: Partial<ApiClient> = {
        register: vi.fn().mockResolvedValue({
          ok: false,
          kind: "http",
          status: 409,
          code: "email-taken",
          message: "Email is already registered",
        }),
      };

      const outcome = await runAuthRegister({
        client: mockClient as ApiClient,
        email: "existing@example.com",
        password: "securepassword123",
      });

      expect(outcome).toEqual({ kind: "email-taken" });
    });

    it("runAuthRegister handles rate limiting (429)", async () => {
      const mockClient: Partial<ApiClient> = {
        register: vi.fn().mockResolvedValue({
          ok: false,
          kind: "http",
          status: 429,
          code: "rate-limited",
          message: "Too many requests",
          retryAfterSeconds: 3600,
        }),
      };

      const outcome = await runAuthRegister({
        client: mockClient as ApiClient,
        email: "new@example.com",
        password: "securepassword123",
      });

      expect(outcome).toEqual({
        kind: "rate-limited",
        retryAfterSeconds: 3600,
      });
    });
  });

  describe("4. Navigation & Shell Integration", () => {
    it("AppHeader reflects active route state for /login and /register", async () => {
      const { AppHeader } = await import("./AppHeader.js");

      // On /login route
      const loginHeaderHtml = renderToStaticMarkup(
        React.createElement(AppHeader, { currentRoute: { kind: "login" } }),
      );
      expect(loginHeaderHtml).toContain('href="/login"');
      expect(loginHeaderHtml).toContain('class="shell-auth-link is-active"');
      expect(loginHeaderHtml).toContain('aria-current="page"');

      // On /register route
      const registerHeaderHtml = renderToStaticMarkup(
        React.createElement(AppHeader, { currentRoute: { kind: "register" } }),
      );
      expect(registerHeaderHtml).toContain('href="/register"');
      expect(registerHeaderHtml).toContain('class="shell-btn-primary is-active"');
      expect(registerHeaderHtml).toContain('aria-current="page"');
    });

    it("App router matches and mounts LoginPage and RegisterPage views", async () => {
      const { matchPath } = await import("../../router/router.js");

      expect(matchPath("/login")).toEqual({ kind: "login" });
      expect(matchPath("/register")).toEqual({ kind: "register" });
    });

    it("App shell excludes AppHeader on login and register routes", async () => {
      const { App } = await import("../../App.js");

      const originalWindow = (globalThis as unknown as { window?: unknown }).window;
      try {
        (globalThis as unknown as { window: unknown }).window = {
          location: { pathname: "/login" },
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        };
        const loginAppHtml = renderToStaticMarkup(React.createElement(App, {}));
        expect(loginAppHtml).not.toContain('role="banner"');
        expect(loginAppHtml).toContain("auth-page");

        (globalThis as unknown as { window: unknown }).window = {
          location: { pathname: "/register" },
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        };
        const registerAppHtml = renderToStaticMarkup(React.createElement(App, {}));
        expect(registerAppHtml).not.toContain('role="banner"');
        expect(registerAppHtml).toContain("auth-page");

        (globalThis as unknown as { window: unknown }).window = {
          location: { pathname: "/" },
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        };
        const landingAppHtml = renderToStaticMarkup(React.createElement(App, {}));
        expect(landingAppHtml).toContain('role="banner"');
      } finally {
        if (originalWindow) {
          (globalThis as unknown as { window: unknown }).window = originalWindow;
        } else {
          delete (globalThis as unknown as { window?: unknown }).window;
        }
      }
    });
  });
});
