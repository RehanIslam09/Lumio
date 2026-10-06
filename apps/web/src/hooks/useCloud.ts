import { useReducer, useEffect, useMemo, useCallback, useState, useRef } from "react";
import type { Project } from "@repo/schema";
import { createApiClient, type ApiClient } from "../api/client.js";
import { getApiBaseUrl } from "../api/config.js";
import type { UserDto } from "../api/types.js";
import {
  runAuthLogout,
  runAuthMe,
  runCloudFetchVersion,
  runCloudListVersions,
  runCloudOpen,
  runCloudSave,
  runCloudSaveOverwrite,
} from "../cloud/outcomes.js";
import {
  cloudReducer,
  computeNextCleanMarker,
  initialCloudState,
  type CleanMarker,
} from "../cloud/state.js";
import type {
  FetchVersionOutcome,
  ListVersionsOutcome,
  ProjectBinding,
} from "../cloud/types.js";

/**
 * ARCHITECTURE NOTE:
 * document.id is the client's local project identifier stored inside the JSON document.
 * The cloud project ID (binding.projectId) is the server-assigned UUID in PostgreSQL.
 * They are deliberately distinct concepts.
 */

export interface UseCloudOptions {
  onReplaceProject: (project: Project, binding: ProjectBinding | null) => void;
  onSavedCleanMarker: (marker: CleanMarker) => void;
  onSetMessage: (message: string | null) => void;
}

export function useCloud({
  onReplaceProject,
  onSavedCleanMarker,
  onSetMessage,
}: UseCloudOptions) {
  const [state, dispatch] = useReducer(cloudReducer, initialCloudState);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [cloudOpenDialogOpen, setCloudOpenDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [notFoundContext, setNotFoundContext] = useState<"save" | "history">("save");

  // Ref tracking the latest state.generation across async await boundaries
  const generationRef = useRef(state.generation);
  useEffect(() => {
    generationRef.current = state.generation;
  }, [state.generation]);

  const client: ApiClient = useMemo(() => {
    return createApiClient({ baseUrl: getApiBaseUrl() });
  }, []);

  // 1. Initial /me check on startup
  useEffect(() => {
    let active = true;

    async function checkAuth() {
      const outcome = await runAuthMe({ client });
      if (!active) return;

      if (outcome.kind === "signed-in") {
        dispatch({ type: "setAuth", auth: { kind: "signedIn", user: outcome.user } });
      } else if (outcome.kind === "network") {
        dispatch({ type: "setAuth", auth: { kind: "offline" } });
      } else {
        dispatch({ type: "setAuth", auth: { kind: "anonymous" } });
      }
    }

    void checkAuth();
    return () => {
      active = false;
    };
  }, [client]);

  // 2. Save flow
  const saveToCloud = useCallback(
    async (snapshot: Project) => {
      if (state.operation.kind !== "idle") return;

      // If user is anonymous or unknown, prompt auth dialog first
      if (state.auth.kind !== "signedIn") {
        setAuthNotice("Please sign in or create an account to save your work to the cloud.");
        setAuthDialogOpen(true);
        return;
      }

      const currentGen = state.generation;
      dispatch({ type: "startOperation", op: "save" });

      const outcome = await runCloudSave({
        client,
        binding: state.binding,
        snapshot,
        schemaVersion: 1,
      });

      if (currentGen !== generationRef.current) return;

      if (outcome.kind === "created") {
        dispatch({
          type: "saveSucceeded",
          binding: {
            projectId: outcome.project.id,
            baseVersion: outcome.version.versionNumber,
            name: outcome.project.name,
          },
          generation: currentGen,
        });
        onSavedCleanMarker(computeNextCleanMarker(outcome.snapshot));
        onSetMessage(`Project saved to cloud as "${outcome.project.name}" (v${outcome.version.versionNumber}).`);
      } else if (outcome.kind === "saved") {
        dispatch({
          type: "saveSucceeded",
          binding: {
            projectId: outcome.project.id,
            baseVersion: outcome.version.versionNumber,
            name: outcome.project.name,
          },
          generation: currentGen,
        });
        onSavedCleanMarker(computeNextCleanMarker(outcome.snapshot));
        onSetMessage(`Cloud project updated to v${outcome.version.versionNumber}.`);
      } else if (outcome.kind === "conflict") {
        dispatch({
          type: "conflictOccurred",
          currentVersion: outcome.currentVersion,
          snapshot: outcome.snapshot,
          generation: currentGen,
        });
      } else if (outcome.kind === "not-found") {
        setNotFoundContext("save");
        dispatch({ type: "saveNotFound", generation: currentGen });
      } else if (outcome.kind === "unauthenticated") {
        dispatch({ type: "setAuth", auth: { kind: "anonymous" } });
        dispatch({ type: "dismissOperation" });
        setAuthNotice("Your session has expired. Sign in again; your work is untouched.");
        setAuthDialogOpen(true);
        onSetMessage("Session expired. Please sign in to save your work.");
      } else if (outcome.kind === "rate-limited") {
        const msg = outcome.retryAfterSeconds
          ? `Too many cloud save requests. Please wait ${outcome.retryAfterSeconds}s before saving again.`
          : "Too many cloud save requests. Please slow down.";
        dispatch({
          type: "operationFailed",
          message: msg,
          retryAfterSeconds: outcome.retryAfterSeconds,
          generation: currentGen,
        });
        onSetMessage(msg);
      } else if (outcome.kind === "too-large") {
        const msg = "Project exceeds maximum allowed cloud storage size (5 MB).";
        dispatch({ type: "operationFailed", message: msg, generation: currentGen });
        onSetMessage(msg);
      } else if (outcome.kind === "limit-reached") {
        const msg = "Account project limit reached (200 projects max).";
        dispatch({ type: "operationFailed", message: msg, generation: currentGen });
        onSetMessage(msg);
      } else if (outcome.kind === "unsupported-schema") {
        const msg = "The project uses an unsupported schema version.";
        dispatch({ type: "operationFailed", message: msg, generation: currentGen });
        onSetMessage(msg);
      } else if (outcome.kind === "invalid") {
        const msg = "Project validation failed on cloud save.";
        dispatch({ type: "operationFailed", message: msg, generation: currentGen });
        onSetMessage(msg);
      } else if (outcome.kind === "network") {
        const msg = "Network error: Unable to reach Lumio cloud.";
        dispatch({ type: "operationFailed", message: msg, generation: currentGen });
        onSetMessage(msg);
      } else if (outcome.kind === "timeout") {
        const msg = "Cloud save request timed out.";
        dispatch({ type: "operationFailed", message: msg, generation: currentGen });
        onSetMessage(msg);
      } else {
        const msg = outcome.message || "Failed to save project to cloud.";
        dispatch({ type: "operationFailed", message: msg, generation: currentGen });
        onSetMessage(msg);
      }
    },
    [client, state.binding, state.generation, state.operation.kind, state.auth.kind, onSavedCleanMarker, onSetMessage],
  );

  // 3. Conflict resolution: Keep Mine (save overwrite)
  const resolveConflictKeepMine = useCallback(
    async (snapshot: Project) => {
      if (state.operation.kind !== "conflict" || !state.binding) return;

      const currentGen = state.generation;
      const conflictVersion = state.operation.currentVersion;
      dispatch({ type: "conflictKeepMine" });

      const outcome = await runCloudSaveOverwrite({
        client,
        binding: state.binding,
        currentVersion: conflictVersion,
        snapshot,
        schemaVersion: 1,
      });

      if (currentGen !== generationRef.current) return;

      if (outcome.kind === "saved") {
        dispatch({
          type: "saveSucceeded",
          binding: {
            projectId: outcome.project.id,
            baseVersion: outcome.version.versionNumber,
            name: outcome.project.name,
          },
          generation: currentGen,
        });
        onSavedCleanMarker(computeNextCleanMarker(outcome.snapshot));
        onSetMessage(`Cloud project overwritten and saved as v${outcome.version.versionNumber}.`);
      } else if (outcome.kind === "conflict") {
        dispatch({
          type: "conflictOccurred",
          currentVersion: outcome.currentVersion,
          snapshot: outcome.snapshot,
          generation: currentGen,
        });
        onSetMessage("Another conflict occurred while attempting to overwrite.");
      } else if (outcome.kind === "unauthenticated") {
        dispatch({ type: "setAuth", auth: { kind: "anonymous" } });
        dispatch({ type: "dismissOperation" });
        setAuthNotice("Your session has expired. Sign in again; your work is untouched.");
        setAuthDialogOpen(true);
      } else {
        dispatch({ type: "dismissOperation" });
        onSetMessage(outcome.kind === "error" ? outcome.message : "Failed to overwrite cloud version.");
      }
    },
    [client, state.binding, state.generation, state.operation, onSavedCleanMarker, onSetMessage],
  );

  // 4. Conflict resolution: Load Latest
  const resolveConflictLoadLatest = useCallback(async () => {
    if (!state.binding) return;

    const confirmed = window.confirm(
      "Load the latest version from the cloud? Any unsaved local edits in this session will be replaced.",
    );
    if (!confirmed) return;

    dispatch({ type: "dismissOperation" });
    const currentGen = state.generation;
    dispatch({ type: "startOperation", op: "open" });

    const outcome = await runCloudOpen({ client, projectId: state.binding.projectId });
    if (currentGen !== generationRef.current) return;

    if (outcome.kind === "loaded") {
      onReplaceProject(outcome.project, outcome.binding);
      if (outcome.warnings.length > 0) {
        onSetMessage(`Cloud project loaded with warnings:\n${outcome.warnings.join("\n")}`);
      } else {
        onSetMessage(`Loaded latest cloud version (v${outcome.binding.baseVersion}).`);
      }
    } else {
      dispatch({ type: "dismissOperation" });
      onSetMessage(outcome.kind === "error" ? outcome.message : "Failed to load latest cloud version.");
    }
  }, [client, state.binding, state.generation, onReplaceProject, onSetMessage]);

  // 5. Open from cloud action
  const openFromCloud = useCallback(
    async (projectId: string) => {
      if (state.operation.kind !== "idle") return;

      const currentGen = state.generation;
      dispatch({ type: "startOperation", op: "open" });

      const outcome = await runCloudOpen({ client, projectId });
      if (currentGen !== generationRef.current) return;

      if (outcome.kind === "loaded") {
        onReplaceProject(outcome.project, outcome.binding);
        if (outcome.warnings.length > 0) {
          onSetMessage(`Cloud project loaded with warnings:\n${outcome.warnings.join("\n")}`);
        } else {
          onSetMessage(`Opened "${outcome.binding.name}" from cloud (v${outcome.binding.baseVersion}).`);
        }
      } else if (outcome.kind === "unauthenticated") {
        dispatch({ type: "setAuth", auth: { kind: "anonymous" } });
        dispatch({ type: "dismissOperation" });
        setAuthNotice("Your session has expired. Sign in again to open cloud projects.");
        setAuthDialogOpen(true);
      } else if (outcome.kind === "invalid-document") {
        dispatch({ type: "dismissOperation" });
        onSetMessage(`Cloud document failed integrity verification:\n${outcome.details.join("\n")}`);
      } else {
        dispatch({ type: "dismissOperation" });
        onSetMessage(outcome.kind === "error" ? outcome.message : "Failed to open cloud project.");
      }
    },
    [client, state.generation, state.operation.kind, onReplaceProject, onSetMessage],
  );

  // 6. Sign in / Register / Sign out handlers
  const handleSignOut = useCallback(async () => {
    const currentGen = state.generation;
    dispatch({ type: "startOperation", op: "auth" });
    try {
      await runAuthLogout({ client });
    } finally {
      if (currentGen === generationRef.current) {
        dispatch({ type: "setAuth", auth: { kind: "anonymous" } });
        dispatch({ type: "dismissOperation" });
        onSetMessage("Signed out.");
      }
    }
  }, [client, state.generation, onSetMessage]);

  const handleAuthSuccess = useCallback(
    (user: UserDto) => {
      dispatch({ type: "setAuth", auth: { kind: "signedIn", user } });
      setAuthNotice(null);
      onSetMessage(`Signed in as ${user.email}.`);
    },
    [onSetMessage],
  );

  const handleBoundProjectDeleted = useCallback(
    (deletedProjectId: string) => {
      if (state.binding?.projectId === deletedProjectId) {
        dispatch({ type: "projectUnbound" });
        // The project is now unbound, so work exists only locally -> marker is set to unbound
        onSavedCleanMarker({ kind: "unbound" });
        onSetMessage("The linked cloud project was deleted. Your work now exists only locally.");
      }
    },
    [state.binding, onSavedCleanMarker, onSetMessage],
  );

  const handleSaveAsNew = useCallback(
    (snapshot: Project) => {
      dispatch({ type: "dismissOperation" });
      // Clear binding and save as new cloud project
      dispatch({ type: "projectUnbound" });
      void saveToCloud(snapshot);
    },
    [saveToCloud],
  );

  // 7. Version history actions
  const listVersions = useCallback(async (): Promise<ListVersionsOutcome | null> => {
    if (!state.binding) return null;
    const currentGen = state.generation;
    dispatch({ type: "startOperation", op: "listVersions" });

    const outcome = await runCloudListVersions({
      client,
      projectId: state.binding.projectId,
    });

    if (currentGen !== generationRef.current) return null;

    if (outcome.kind === "unauthenticated") {
      setHistoryDialogOpen(false);
      dispatch({ type: "setAuth", auth: { kind: "anonymous" } });
      dispatch({ type: "dismissOperation" });
      setAuthNotice("Your session has expired. Sign in again to view version history.");
      setAuthDialogOpen(true);
      onSetMessage("Session expired. Please sign in.");
      return outcome;
    }

    if (outcome.kind === "not-found") {
      setHistoryDialogOpen(false);
      setNotFoundContext("history");
      dispatch({ type: "saveNotFound", generation: currentGen });
      return outcome;
    }

    dispatch({ type: "dismissOperation" });
    if (outcome.kind === "error") {
      onSetMessage(outcome.message);
    }
    return outcome;
  }, [client, state.binding, state.generation, onSetMessage]);

  const fetchVersion = useCallback(
    async (versionNumber: number): Promise<FetchVersionOutcome | null> => {
      if (!state.binding) return null;
      const currentGen = state.generation;
      dispatch({ type: "startOperation", op: "fetchVersion" });

      const outcome = await runCloudFetchVersion({
        client,
        projectId: state.binding.projectId,
        versionNumber,
      });

      if (currentGen !== generationRef.current) return null;

      if (outcome.kind === "unauthenticated") {
        setHistoryDialogOpen(false);
        dispatch({ type: "setAuth", auth: { kind: "anonymous" } });
        dispatch({ type: "dismissOperation" });
        setAuthNotice("Your session has expired. Sign in again to access versions.");
        setAuthDialogOpen(true);
        onSetMessage("Session expired. Please sign in.");
        return outcome;
      }

      if (outcome.kind === "not-found") {
        setHistoryDialogOpen(false);
        setNotFoundContext("history");
        dispatch({ type: "saveNotFound", generation: currentGen });
        return outcome;
      }

      dispatch({ type: "dismissOperation" });
      if (outcome.kind === "error") {
        onSetMessage(outcome.message);
      }
      return outcome;
    },
    [client, state.binding, state.generation, onSetMessage],
  );

  return {
    state,
    dispatch,
    client,
    authDialogOpen,
    setAuthDialogOpen,
    authNotice,
    cloudOpenDialogOpen,
    setCloudOpenDialogOpen,
    historyDialogOpen,
    setHistoryDialogOpen,
    notFoundContext,
    saveToCloud,
    resolveConflictKeepMine,
    resolveConflictLoadLatest,
    openFromCloud,
    listVersions,
    fetchVersion,
    handleSignOut,
    handleAuthSuccess,
    handleBoundProjectDeleted,
    handleSaveAsNew,
  };
}
