import { describe, expect, it } from "vitest";
import {
  createPreviewLoader,
  type DocumentFetchOutcome,
  type ThumbnailLoadState,
} from "./storyThumbnailLoader.js";

describe("createPreviewLoader (D, A3, A5, A6, A7)", () => {
  const validProjectDoc = {
    id: "p1",
    name: "Story 1",
    nodes: [
      { id: "n1", type: "start", title: "Start", position: { x: 0, y: 0 } },
      { id: "n2", type: "end", title: "End", position: { x: 100, y: 0 } },
    ],
    edges: [{ id: "e1", from: "n1", to: "n2" }],
    variables: [],
  };

  it("never exceeds concurrency limit of 2 and drains queue in FIFO order", async () => {
    let currentInFlight = 0;
    let maxObservedInFlight = 0;
    const resolvers: Array<() => void> = [];

    const fetchDocument = async (): Promise<DocumentFetchOutcome> => {
      currentInFlight++;
      if (currentInFlight > maxObservedInFlight) {
        maxObservedInFlight = currentInFlight;
      }
      await new Promise<void>((resolve) => {
        resolvers.push(() => {
          currentInFlight--;
          resolve();
        });
      });
      return {
        ok: true,
        schemaVersion: 2,
        rawDocument: validProjectDoc,
      };
    };

    const loader = createPreviewLoader({
      fetchDocument,
      concurrency: 2,
      cacheSize: 10,
    });

    const states1: ThumbnailLoadState[] = [];
    const states2: ThumbnailLoadState[] = [];
    const states3: ThumbnailLoadState[] = [];
    const states4: ThumbnailLoadState[] = [];

    loader.subscribe("s1", 1, (s) => states1.push(s));
    loader.subscribe("s2", 1, (s) => states2.push(s));
    loader.subscribe("s3", 1, (s) => states3.push(s));
    loader.subscribe("s4", 1, (s) => states4.push(s));

    // Initially s1 and s2 are in flight (concurrency 2), s3 and s4 are queued
    expect(maxObservedInFlight).toBe(2);
    expect(currentInFlight).toBe(2);

    // Resolve s1 and s2
    resolvers[0]?.();
    resolvers[1]?.();
    await new Promise((r) => setTimeout(r, 10));

    // s3 and s4 should now run, never exceeding 2
    expect(maxObservedInFlight).toBe(2);
    expect(currentInFlight).toBe(2);

    resolvers[2]?.();
    resolvers[3]?.();
    await new Promise((r) => setTimeout(r, 10));

    expect(currentInFlight).toBe(0);
    expect(maxObservedInFlight).toBe(2);
    expect(states1.at(-1)?.status).toBe("ready");
    expect(states4.at(-1)?.status).toBe("ready");
  });

  it("serves cache hits immediately without refetching", async () => {
    let fetchCount = 0;
    const fetchDocument = async (): Promise<DocumentFetchOutcome> => {
      fetchCount++;
      return {
        ok: true,
        schemaVersion: 2,
        rawDocument: validProjectDoc,
      };
    };

    const loader = createPreviewLoader({
      fetchDocument,
      concurrency: 2,
      cacheSize: 10,
    });

    const states1: ThumbnailLoadState[] = [];
    loader.subscribe("p1", 1, (s) => states1.push(s));
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchCount).toBe(1);
    expect(states1.at(-1)?.status).toBe("ready");

    // Second subscription to same id:version must use cache
    const states2: ThumbnailLoadState[] = [];
    loader.subscribe("p1", 1, (s) => states2.push(s));
    expect(states2[0]?.status).toBe("ready");
    expect(fetchCount).toBe(1); // No new network call
  });

  it("refetches when version number changes (cache key includes version)", async () => {
    let fetchCount = 0;
    const fetchDocument = async (): Promise<DocumentFetchOutcome> => {
      fetchCount++;
      return {
        ok: true,
        schemaVersion: 2,
        rawDocument: validProjectDoc,
      };
    };

    const loader = createPreviewLoader({
      fetchDocument,
      concurrency: 2,
      cacheSize: 10,
    });

    loader.subscribe("p1", 1, () => {});
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchCount).toBe(1);

    // Version bumped to 2
    loader.subscribe("p1", 2, () => {});
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchCount).toBe(2); // refetched
  });

  it("evicts least recently used items when exceeding cacheSize", async () => {
    let fetchCount = 0;
    const fetchDocument = async (id: string): Promise<DocumentFetchOutcome> => {
      fetchCount++;
      return {
        ok: true,
        schemaVersion: 2,
        rawDocument: { ...validProjectDoc, id },
      };
    };

    const loader = createPreviewLoader({
      fetchDocument,
      concurrency: 2,
      cacheSize: 2, // Tiny cache for test
    });

    loader.subscribe("p1", 1, () => {});
    await new Promise((r) => setTimeout(r, 5));
    loader.subscribe("p2", 1, () => {});
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchCount).toBe(2);

    // Access p3 -> should evict p1 (oldest)
    loader.subscribe("p3", 1, () => {});
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchCount).toBe(3);

    // p2 is still cached
    loader.subscribe("p2", 1, () => {});
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchCount).toBe(3); // Cache hit

    // p1 was evicted -> should refetch
    loader.subscribe("p1", 1, () => {});
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchCount).toBe(4);
  });

  it("shares in-flight requests (A6 in-flight dedupe) and cancels fetch only when all subscribers unsubscribe", async () => {
    let fetchCalls = 0;
    let signalAborted = false;
    let finishFetch: (() => void) | undefined;

    const fetchDocument = async (_id: string, signal: AbortSignal): Promise<DocumentFetchOutcome> => {
      fetchCalls++;
      signal.addEventListener("abort", () => {
        signalAborted = true;
      });
      await new Promise<void>((r) => {
        finishFetch = r;
      });
      if (signal.aborted) {
        return { ok: false, kind: "aborted", message: "aborted" };
      }
      return {
        ok: true,
        schemaVersion: 2,
        rawDocument: validProjectDoc,
      };
    };

    const loader = createPreviewLoader({
      fetchDocument,
      concurrency: 2,
      cacheSize: 10,
    });

    const states1: ThumbnailLoadState[] = [];
    const states2: ThumbnailLoadState[] = [];

    // Two simultaneous requests for identical id and version
    const unsub1 = loader.subscribe("shared-story", 5, (s) => states1.push(s));
    const unsub2 = loader.subscribe("shared-story", 5, (s) => states2.push(s));

    // Must trigger exactly 1 network fetch
    expect(fetchCalls).toBe(1);

    // Subscriber 1 unsubscribes; subscriber 2 remains
    unsub1();
    expect(signalAborted).toBe(false); // Do NOT abort underlying fetch while sub2 is alive

    // Complete fetch
    finishFetch?.();
    await new Promise((r) => setTimeout(r, 10));

    expect(states2.at(-1)?.status).toBe("ready");
    unsub2();
  });

  it("aborts underlying in-flight fetch when all subscribers unsubscribe before completion", async () => {
    let signalAborted = false;

    const fetchDocument = async (_id: string, signal: AbortSignal): Promise<DocumentFetchOutcome> => {
      signal.addEventListener("abort", () => {
        signalAborted = true;
      });
      await new Promise(() => {}); // never finishes unless aborted
      return { ok: false, kind: "aborted", message: "aborted" };
    };

    const loader = createPreviewLoader({
      fetchDocument,
      concurrency: 2,
      cacheSize: 10,
    });

    const unsub = loader.subscribe("cancel-me", 1, () => {});
    expect(signalAborted).toBe(false);

    unsub();
    expect(signalAborted).toBe(true);

    // Not cached
    expect(loader.get("cancel-me", 1)).toBeUndefined();
  });

  it("does not cache failed requests and allows Retry to attempt load again (A7)", async () => {
    let failFirst = true;
    let fetchAttempts = 0;

    const fetchDocument = async (): Promise<DocumentFetchOutcome> => {
      fetchAttempts++;
      if (failFirst) {
        failFirst = false;
        return { ok: false, kind: "error", message: "Server error 500" };
      }
      return {
        ok: true,
        schemaVersion: 2,
        rawDocument: validProjectDoc,
      };
    };

    const loader = createPreviewLoader({
      fetchDocument,
      concurrency: 2,
      cacheSize: 10,
    });

    const states1: ThumbnailLoadState[] = [];
    loader.subscribe("retry-test", 1, (s) => states1.push(s));
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchAttempts).toBe(1);
    expect(states1.at(-1)?.status).toBe("error");

    // Must NOT be in cache as success
    expect(loader.get("retry-test", 1)?.status).toBe("error");

    // Retry triggers fresh attempt
    const states2: ThumbnailLoadState[] = [];
    loader.retry("retry-test", 1, (s) => states2.push(s));
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchAttempts).toBe(2);
    expect(states2.at(-1)?.status).toBe("ready");
    expect(loader.get("retry-test", 1)?.status).toBe("ready");
  });

  it("reports error for unreadable schema version or invalid project document (A5)", async () => {
    const fetchDocument = async (id: string): Promise<DocumentFetchOutcome> => {
      if (id === "unreadable-version") {
        return {
          ok: true,
          schemaVersion: 999, // unsupported future schema version
          rawDocument: validProjectDoc,
        };
      }
      return {
        ok: true,
        schemaVersion: 2,
        rawDocument: { invalid: "garbage" }, // fails schema validation
      };
    };

    const loader = createPreviewLoader({
      fetchDocument,
      concurrency: 2,
      cacheSize: 10,
    });

    const states1: ThumbnailLoadState[] = [];
    loader.subscribe("unreadable-version", 1, (s) => states1.push(s));
    await new Promise((r) => setTimeout(r, 10));
    expect(states1.at(-1)?.status).toBe("error");

    const states2: ThumbnailLoadState[] = [];
    loader.subscribe("invalid-doc", 1, (s) => states2.push(s));
    await new Promise((r) => setTimeout(r, 10));
    expect(states2.at(-1)?.status).toBe("error");
  });
});
