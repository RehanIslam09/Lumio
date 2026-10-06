export type ApiBaseUrlResult =
  | { ok: true; baseUrl: string }
  | { ok: false; error: string };

export const DEFAULT_API_BASE_URL = "http://localhost:3001";

/**
 * Resolves and validates the API base URL.
 * Undefined or empty/whitespace string returns the default localhost:3001.
 * Must be http: or https:, no credentials, no query, no hash, no path prefix.
 * Strips trailing slash. Never throws.
 */
export function resolveApiBaseUrl(raw: string | undefined): ApiBaseUrlResult {
  if (raw === undefined || raw.trim() === "") {
    return { ok: true, baseUrl: DEFAULT_API_BASE_URL };
  }

  const trimmed = raw.trim();

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Invalid URL format" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "API base URL must use http: or https: protocol" };
  }

  if (url.username || url.password) {
    return { ok: false, error: "API base URL must not contain credentials" };
  }

  if (url.search) {
    return { ok: false, error: "API base URL must not contain query parameters" };
  }

  if (url.hash) {
    return { ok: false, error: "API base URL must not contain a URL fragment / hash" };
  }

  if (url.pathname !== "" && url.pathname !== "/") {
    return { ok: false, error: "Path prefix is not supported in API base URL" };
  }

  return { ok: true, baseUrl: `${url.protocol}//${url.host}` };
}

/**
 * Retrieves the resolved API base URL from Vite environment variable.
 */
export function getApiBaseUrl(): string {
  const resolved = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (resolved.ok) {
    return resolved.baseUrl;
  }
  return DEFAULT_API_BASE_URL;
}
