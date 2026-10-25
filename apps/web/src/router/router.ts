import type { NavigationOptions, Route } from "./types.js";

export const NAVIGATE_EVENT = "lumio:navigate";

export function safeDecodeURIComponent(str: string): string | null {
  try {
    return decodeURIComponent(str);
  } catch {
    return null;
  }
}

/**
 * Normalizes a raw pathname:
 * - Trims whitespace
 * - Strips leading query strings or hashes if present
 * - Collapses consecutive forward slashes
 * - Removes trailing slash (unless the path is exactly "/")
 */
export function normalizePath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== "string") {
    return "/";
  }

  // Strip query string and fragment if passed
  const clean = rawPath.split("?")[0]?.split("#")[0]?.trim() ?? "/";
  if (!clean || clean === "") {
    return "/";
  }

  // Ensure leading slash
  const withLeading = clean.startsWith("/") ? clean : `/${clean}`;

  // Collapse duplicate slashes e.g. "//projects///abc" -> "/projects/abc"
  const collapsed = withLeading.replace(/\/+/g, "/");

  // Remove trailing slash unless it's just "/"
  if (collapsed.length > 1 && collapsed.endsWith("/")) {
    return collapsed.slice(0, -1);
  }

  return collapsed;
}

/**
 * Pure route matching function.
 * Matches normalized pathname to a typed Route object.
 */
export function matchPath(pathname: string): Route {
  const normalized = normalizePath(pathname);

  if (normalized === "/") {
    return { kind: "landing" };
  }
  if (normalized === "/login") {
    return { kind: "login" };
  }
  if (normalized === "/register") {
    return { kind: "register" };
  }
  if (normalized === "/dashboard") {
    return { kind: "dashboard" };
  }
  if (normalized === "/editor") {
    return { kind: "editor" };
  }

  if (normalized.startsWith("/projects/")) {
    const remainder = normalized.slice("/projects/".length);
    // Disallow nested subpaths e.g. /projects/123/extra
    if (remainder.includes("/")) {
      return { kind: "notFound", path: pathname };
    }

    if (remainder === "") {
      return { kind: "notFound", path: pathname };
    }

    const decodedId = safeDecodeURIComponent(remainder);
    if (decodedId === null || decodedId.trim() === "") {
      return { kind: "notFound", path: pathname };
    }

    return { kind: "project", projectId: decodedId };
  }

  return { kind: "notFound", path: pathname };
}

/**
 * Pure path formatting function. Converts a Route object to its canonical pathname.
 */
export function formatPath(route: Route): string {
  switch (route.kind) {
    case "landing":
      return "/";
    case "login":
      return "/login";
    case "register":
      return "/register";
    case "dashboard":
      return "/dashboard";
    case "editor":
      return "/editor";
    case "project":
      return `/projects/${encodeURIComponent(route.projectId)}`;
    case "notFound":
      return route.path;
  }
}

/**
 * Client-side navigation helper. Updates HTML5 history and notifies router subscribers.
 */
export function navigate(to: string | Route, options?: NavigationOptions): void {
  if (typeof window === "undefined") {
    return;
  }

  const destPath = typeof to === "string" ? normalizePath(to) : formatPath(to);

  // If current path matches destination exactly, avoid redundant history push unless replace requested
  const currentPath = normalizePath(window.location.pathname);
  if (currentPath === destPath && !options?.replace) {
    return;
  }

  if (options?.replace) {
    window.history.replaceState(null, "", destPath);
  } else {
    window.history.pushState(null, "", destPath);
  }

  window.dispatchEvent(
    new CustomEvent(NAVIGATE_EVENT, {
      detail: { path: destPath },
    }),
  );
}
