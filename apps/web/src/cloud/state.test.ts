import { describe, expect, it } from "vitest";
import type { Project } from "@repo/schema";
import {
  cloudReducer,
  initialCloudState,
  isMarkerDirty,
  isHistoryEnabled,
  computeNextCleanMarker,
  createUnboundMarker,
  type CloudState,
} from "./state.js";

describe("cloud state reducer and clean marker", () => {
  const sampleProject1: Project = {
    id: "p1",
    name: "Doc 1",
    nodes: [],
    edges: [],
    variables: [],
  };

  const sampleProject2: Project = {
    ...sampleProject1,
    name: "Doc 2 (Edited)",
  };

  const initialBinding = {
    projectId: "cloud-123",
    baseVersion: 1,
    name: "Doc 1",
  };

  describe("Single pending operation invariant", () => {
    it("ignores subsequent startOperation while pending (no-op)", () => {
      const state1 = cloudReducer(initialCloudState, {
        type: "startOperation",
        op: "save",
      });
      expect(state1.operation).toEqual({ kind: "pending", op: "save" });

      // Attempt second operation while first is pending
      const state2 = cloudReducer(state1, {
        type: "startOperation",
        op: "open",
      });
      // Remains 'save' - second operation was ignored
      expect(state2.operation).toEqual({ kind: "pending", op: "save" });
    });
  });

  describe("Generation guard and stale outcomes", () => {
    it("drops stale outcomes when generation has advanced", () => {
      const boundState: CloudState = {
        ...initialCloudState,
        binding: initialBinding,
        generation: 1,
        operation: { kind: "pending", op: "save" },
      };

      // Project replaced locally -> generation bumps to 2
      const advancedState = cloudReducer(boundState, {
        type: "replaceProject",
        source: "local",
        binding: null,
      });
      expect(advancedState.generation).toBe(2);
      expect(advancedState.binding).toBeNull();

      // Stale save result from generation 1 arrives
      const staleState = cloudReducer(advancedState, {
        type: "saveSucceeded",
        binding: { projectId: "cloud-123", baseVersion: 2, name: "Doc 1" },
        generation: 1,
      });

      // No change to binding or generation
      expect(staleState.binding).toBeNull();
      expect(staleState.generation).toBe(2);
    });
  });

  describe("Successful save and binding updates", () => {
    it("updates binding.baseVersion to new version number when generation matches", () => {
      const boundState: CloudState = {
        ...initialCloudState,
        binding: initialBinding,
        generation: 1,
        operation: { kind: "pending", op: "save" },
      };

      const next = cloudReducer(boundState, {
        type: "saveSucceeded",
        binding: { projectId: "cloud-123", baseVersion: 2, name: "Doc 1" },
        generation: 1,
      });

      expect(next.binding).toEqual({
        projectId: "cloud-123",
        baseVersion: 2,
        name: "Doc 1",
      });
      expect(next.operation).toEqual({ kind: "idle" });
    });
  });

  describe("401 / Auth handling", () => {
    it("sets anonymous and keeps the binding on 401", () => {
      const state: CloudState = {
        ...initialCloudState,
        auth: { kind: "signedIn", user: { id: "u1", email: "a@b.com" } },
        binding: initialBinding,
      };

      const next = cloudReducer(state, {
        type: "setAuth",
        auth: { kind: "anonymous" },
      });

      expect(next.auth).toEqual({ kind: "anonymous" });
      expect(next.binding).toEqual(initialBinding); // Kept intact
    });
  });

  describe("Local file actions and project replacement", () => {
    it("local file Open, New, and Reset set binding to null and bump generation", () => {
      const state: CloudState = {
        ...initialCloudState,
        binding: initialBinding,
        generation: 3,
      };

      const next = cloudReducer(state, {
        type: "replaceProject",
        source: "local",
        binding: null,
      });

      expect(next.binding).toBeNull();
      expect(next.generation).toBe(4);
    });

    it("cloud Open sets the new binding and bumps generation", () => {
      const state: CloudState = {
        ...initialCloudState,
        binding: null,
        generation: 1,
      };

      const newBinding = {
        projectId: "cloud-999",
        baseVersion: 3,
        name: "Loaded Cloud",
      };

      const next = cloudReducer(state, {
        type: "replaceProject",
        source: "cloud",
        binding: newBinding,
      });

      expect(next.binding).toEqual(newBinding);
      expect(next.generation).toBe(2);
    });

    it("local file Save preserves existing cloud binding", () => {
      const state: CloudState = {
        ...initialCloudState,
        binding: initialBinding,
        generation: 2,
      };

      const next = cloudReducer(state, {
        type: "localFileSaved",
      });

      expect(next.binding).toEqual(initialBinding);
      expect(next.generation).toBe(2);
    });
  });

  describe("Unbind on delete and typed unbound marker", () => {
    it("deleting bound project unbinds it and bumps generation", () => {
      const state: CloudState = {
        ...initialCloudState,
        binding: initialBinding,
        generation: 5,
      };

      const next = cloudReducer(state, {
        type: "projectUnbound",
      });

      expect(next.binding).toBeNull();
      expect(next.generation).toBe(6);
    });

    it("unbound marker state causes isMarkerDirty to be true even with unchanged present", () => {
      const unboundMarker = createUnboundMarker();
      expect(unboundMarker.kind).toBe("unbound");

      // Present object unchanged, but because marker is unbound, work exists only locally
      expect(isMarkerDirty(sampleProject1, unboundMarker)).toBe(true);
    });
  });

  describe("Conflict handling", () => {
    it("conflict -> keep mine returns to pending saveOverwrite", () => {
      const state: CloudState = {
        ...initialCloudState,
        operation: {
          kind: "conflict",
          currentVersion: 3,
          snapshot: sampleProject1,
        },
      };

      const next = cloudReducer(state, {
        type: "conflictKeepMine",
      });

      expect(next.operation).toEqual({
        kind: "pending",
        op: "saveOverwrite",
      });
    });

    it("conflict -> cancel returns to idle with binding unchanged", () => {
      const state: CloudState = {
        ...initialCloudState,
        binding: initialBinding,
        operation: {
          kind: "conflict",
          currentVersion: 3,
          snapshot: sampleProject1,
        },
      };

      const next = cloudReducer(state, {
        type: "conflictCancel",
      });

      expect(next.operation).toEqual({ kind: "idle" });
      expect(next.binding).toEqual(initialBinding);
    });
  });

  describe("Clean marker helper", () => {
    it("marks clean against sent snapshot; edits made during flight leave project dirty", () => {
      const sentSnapshot = sampleProject1;
      const marker = computeNextCleanMarker(sentSnapshot);

      // If present has not changed since click: clean
      expect(isMarkerDirty(sentSnapshot, marker)).toBe(false);

      // If user typed / edited nodes in canvas while save was in flight: dirty
      const inFlightEdit = sampleProject2;
      expect(isMarkerDirty(inFlightEdit, marker)).toBe(true);
    });
  });

  describe("Version history state transitions and invariants", () => {
    it("versionRestored sets operation back to idle, bumps generation, keeps binding baseVersion UNCHANGED", () => {
      const stateBefore: CloudState = {
        auth: { kind: "signedIn", user: { id: "u-1", email: "a@b.com" } },
        binding: { projectId: "p-123", baseVersion: 3, name: "Project Name" },
        operation: { kind: "pending", op: "fetchVersion" },
        generation: 5,
      };

      const stateAfter = cloudReducer(stateBefore, { type: "versionRestored" });

      expect(stateAfter.operation).toEqual({ kind: "idle" });
      expect(stateAfter.generation).toBe(6);
      expect(stateAfter.binding).toBe(stateBefore.binding);
      expect(stateAfter.binding?.baseVersion).toBe(3);
    });

    it("ignores every other trigger while listVersions or fetchVersion is pending", () => {
      const listState = cloudReducer(initialCloudState, {
        type: "startOperation",
        op: "listVersions",
      });
      expect(listState.operation).toEqual({ kind: "pending", op: "listVersions" });

      const stateAttempt1 = cloudReducer(listState, { type: "startOperation", op: "save" });
      expect(stateAttempt1.operation).toEqual({ kind: "pending", op: "listVersions" });

      const fetchState = cloudReducer(initialCloudState, {
        type: "startOperation",
        op: "fetchVersion",
      });
      expect(fetchState.operation).toEqual({ kind: "pending", op: "fetchVersion" });

      const stateAttempt2 = cloudReducer(fetchState, { type: "startOperation", op: "open" });
      expect(stateAttempt2.operation).toEqual({ kind: "pending", op: "fetchVersion" });
    });

    it("drops stale generation results and changes nothing", () => {
      const state: CloudState = {
        ...initialCloudState,
        binding: initialBinding,
        generation: 4,
        operation: { kind: "pending", op: "listVersions" },
      };

      const res1 = cloudReducer(state, {
        type: "saveSucceeded",
        binding: { projectId: "stale", baseVersion: 99, name: "stale" },
        generation: 3,
      });
      expect(res1).toBe(state);

      const res2 = cloudReducer(state, {
        type: "operationFailed",
        message: "Stale error",
        generation: 2,
      });
      expect(res2).toBe(state);

      const res3 = cloudReducer(state, {
        type: "saveNotFound",
        generation: 1,
      });
      expect(res3).toBe(state);
    });
  });

  describe("isHistoryEnabled predicate table test", () => {
    interface TestCase {
      name: string;
      state: CloudState;
      expected: boolean;
    }

    const cases: TestCase[] = [
      {
        name: "anonymous, unbound, idle -> false",
        state: {
          auth: { kind: "anonymous" },
          binding: null,
          operation: { kind: "idle" },
          generation: 1,
        },
        expected: false,
      },
      {
        name: "anonymous, bound, idle -> false",
        state: {
          auth: { kind: "anonymous" },
          binding: initialBinding,
          operation: { kind: "idle" },
          generation: 1,
        },
        expected: false,
      },
      {
        name: "signedIn, unbound, idle -> false",
        state: {
          auth: { kind: "signedIn", user: { id: "u-1", email: "a@b.com" } },
          binding: null,
          operation: { kind: "idle" },
          generation: 1,
        },
        expected: false,
      },
      {
        name: "signedIn, bound, idle -> true",
        state: {
          auth: { kind: "signedIn", user: { id: "u-1", email: "a@b.com" } },
          binding: initialBinding,
          operation: { kind: "idle" },
          generation: 1,
        },
        expected: true,
      },
      {
        name: "signedIn, bound, pending save -> false",
        state: {
          auth: { kind: "signedIn", user: { id: "u-1", email: "a@b.com" } },
          binding: initialBinding,
          operation: { kind: "pending", op: "save" },
          generation: 1,
        },
        expected: false,
      },
      {
        name: "signedIn, bound, pending listVersions -> false",
        state: {
          auth: { kind: "signedIn", user: { id: "u-1", email: "a@b.com" } },
          binding: initialBinding,
          operation: { kind: "pending", op: "listVersions" },
          generation: 1,
        },
        expected: false,
      },
      {
        name: "signedIn, bound, pending fetchVersion -> false",
        state: {
          auth: { kind: "signedIn", user: { id: "u-1", email: "a@b.com" } },
          binding: initialBinding,
          operation: { kind: "pending", op: "fetchVersion" },
          generation: 1,
        },
        expected: false,
      },
      {
        name: "signedIn, bound, conflict -> false",
        state: {
          auth: { kind: "signedIn", user: { id: "u-1", email: "a@b.com" } },
          binding: initialBinding,
          operation: { kind: "conflict", currentVersion: 2, snapshot: sampleProject1 },
          generation: 1,
        },
        expected: false,
      },
      {
        name: "signedIn, bound, notFound -> false",
        state: {
          auth: { kind: "signedIn", user: { id: "u-1", email: "a@b.com" } },
          binding: initialBinding,
          operation: { kind: "notFound" },
          generation: 1,
        },
        expected: false,
      },
      {
        name: "signedIn, bound, failed -> false",
        state: {
          auth: { kind: "signedIn", user: { id: "u-1", email: "a@b.com" } },
          binding: initialBinding,
          operation: { kind: "failed", message: "Boom" },
          generation: 1,
        },
        expected: false,
      },
      {
        name: "offline, bound, idle -> false",
        state: {
          auth: { kind: "offline" },
          binding: initialBinding,
          operation: { kind: "idle" },
          generation: 1,
        },
        expected: false,
      },
      {
        name: "unknown auth, bound, idle -> false",
        state: {
          auth: { kind: "unknown" },
          binding: initialBinding,
          operation: { kind: "idle" },
          generation: 1,
        },
        expected: false,
      },
    ];

    for (const tc of cases) {
      it(tc.name, () => {
        expect(isHistoryEnabled(tc.state)).toBe(tc.expected);
      });
    }
  });
});

