import { isProjectGetResponse, isServerErrorResponse } from "../../api/guards.js";
import type {
  ApiResult,
  ProjectGetResponse,
  ServerErrorDetail,
} from "../../api/types.js";

export type ThumbnailFetchResult =
  | ApiResult<ProjectGetResponse>
  | { ok: false; kind: "aborted"; message: string };

export interface FetchProjectThumbnailParams {
  baseUrl: string;
  projectId: string;
  signal?: AbortSignal;
  fetchFn?: typeof globalThis.fetch;
}

/**
 * Thin read-only fetch helper for story thumbnails that passes an AbortSignal
 * down to the wire without altering ApiClient contracts.
 *
 * Reuses ApiClient request semantics from apps/web/src/api/client.ts:
 * - URL construction: `${baseUrl.replace(/\/+$/, "")}/api/projects/${encodeURIComponent(projectId)}`
 * - Request options: method: "GET", credentials: "include", Accept: "application/json"
 * - Handles abort, network, HTTP status, and schema validation cleanly.
 * - Debt: Duplicates minimal URL construction and error envelope mapping from client.ts:60-174.
 */
export async function fetchProjectThumbnailDocument(
  params: FetchProjectThumbnailParams,
): Promise<ThumbnailFetchResult> {
  const fetchFn = params.fetchFn ?? globalThis.fetch.bind(globalThis);
  const cleanBase = params.baseUrl.replace(/\/+$/, "");
  const url = `${cleanBase}/api/projects/${encodeURIComponent(params.projectId)}`;

  try {
    const response = await fetchFn(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
      signal: params.signal,
    });

    const status = response.status;
    const text = await response.text();
    let parsedBody: unknown;
    let isJson = false;

    if (text.trim().length > 0) {
      try {
        parsedBody = JSON.parse(text);
        isJson = true;
      } catch {
        isJson = false;
      }
    }

    if (status < 200 || status >= 300) {
      if (isJson && isServerErrorResponse(parsedBody)) {
        const err = parsedBody.error;
        const details: ServerErrorDetail[] | undefined = err.details
          ? err.details.slice(0, 10).map((d) => ({
              path: String(d.path),
              message: String(d.message),
            }))
          : undefined;

        return {
          ok: false,
          kind: "http",
          status,
          code: err.code,
          message: err.message,
          details,
          currentVersion: err.currentVersion,
          supported: err.supported,
        };
      }

      return {
        ok: false,
        kind: "http",
        status,
        message: `Request failed with HTTP status ${status}`,
      };
    }

    if (!isJson || !isProjectGetResponse(parsedBody)) {
      return {
        ok: false,
        kind: "malformed",
        status,
        message: "Server returned unexpected project document structure",
      };
    }

    return {
      ok: true,
      status,
      data: parsedBody,
    };
  } catch (err: unknown) {
    if (
      (err instanceof Error && err.name === "AbortError") ||
      params.signal?.aborted
    ) {
      return {
        ok: false,
        kind: "aborted",
        message: "Request was aborted",
      };
    }

    return {
      ok: false,
      kind: "network",
      message: "Network error: unable to reach the server",
    };
  }
}
