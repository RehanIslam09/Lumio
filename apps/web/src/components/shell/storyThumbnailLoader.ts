import {
  CURRENT_SCHEMA_VERSION,
  isReadableSchemaVersion,
  migrate,
} from "@repo/schema";
import { validateProjectDocument } from "../../persistence/parse.js";
import {
  buildStoryThumbnail,
  type StoryThumbnailData,
  type ThumbnailOptions,
} from "./storyThumbnail.js";

export type DocumentFetchOutcome =
  | { ok: true; schemaVersion: number; rawDocument: unknown }
  | { ok: false; kind: "aborted" | "error"; message: string };

export type FetchDocumentFn = (
  id: string,
  signal: AbortSignal,
) => Promise<DocumentFetchOutcome>;

export type ThumbnailLoadState =
  | { status: "loading" }
  | { status: "ready"; data: StoryThumbnailData }
  | { status: "error"; message: string };

export interface PreviewLoaderOptions {
  fetchDocument: FetchDocumentFn;
  concurrency?: number; // default 2
  cacheSize?: number; // default 50
  thumbnailOptions?: ThumbnailOptions;
}

export interface PreviewLoader {
  subscribe(
    id: string,
    latestVersion: number,
    listener: (state: ThumbnailLoadState) => void,
  ): () => void;
  get(id: string, latestVersion: number): ThumbnailLoadState | undefined;
  retry(
    id: string,
    latestVersion: number,
    listener: (state: ThumbnailLoadState) => void,
  ): () => void;
  clear(): void;
}

interface InFlightEntry {
  id: string;
  latestVersion: number;
  abortController: AbortController;
  subscribers: Map<number, (state: ThumbnailLoadState) => void>;
  isActive: boolean;
}

export function createPreviewLoader(options: PreviewLoaderOptions): PreviewLoader {
  const concurrency = options.concurrency ?? 2;
  const maxCacheSize = options.cacheSize ?? 50;
  const thumbOpts = options.thumbnailOptions;

  // LRU cache storing ONLY StoryThumbnailData (never raw document or Project)
  const cache = new Map<string, StoryThumbnailData>();
  // Store failed load status temporarily so get() returns error until retry
  const errorStates = new Map<string, string>();

  const inFlight = new Map<string, InFlightEntry>();
  const queue: InFlightEntry[] = [];
  let activeCount = 0;
  let nextSubId = 1;

  function makeKey(id: string, version: number): string {
    return `${id}:${version}`;
  }

  function getFromCache(key: string): StoryThumbnailData | undefined {
    const cached = cache.get(key);
    if (cached) {
      // Re-insert at end for LRU freshness
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }
    return undefined;
  }

  function setInCache(key: string, data: StoryThumbnailData) {
    if (cache.size >= maxCacheSize) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }
    cache.set(key, data);
    errorStates.delete(key);
  }

  function drainQueue() {
    while (activeCount < concurrency && queue.length > 0) {
      const nextEntry = queue.shift();
      if (!nextEntry) break;
      if (nextEntry.subscribers.size === 0) {
        // Abandoned before start
        inFlight.delete(makeKey(nextEntry.id, nextEntry.latestVersion));
        continue;
      }
      nextEntry.isActive = true;
      activeCount++;
      executeEntry(nextEntry);
    }
  }

  async function executeEntry(entry: InFlightEntry) {
    const key = makeKey(entry.id, entry.latestVersion);
    try {
      const outcome = await options.fetchDocument(
        entry.id,
        entry.abortController.signal,
      );

      if (entry.abortController.signal.aborted || outcome.ok === false) {
        if (!entry.abortController.signal.aborted && outcome.ok === false) {
          errorStates.set(key, outcome.message);
          for (const listener of entry.subscribers.values()) {
            listener({ status: "error", message: outcome.message });
          }
        }
        return;
      }

      // Validate & migrate project
      const { schemaVersion, rawDocument } = outcome;
      if (!isReadableSchemaVersion(schemaVersion)) {
        const msg = `Unsupported schema version: ${schemaVersion}`;
        errorStates.set(key, msg);
        for (const listener of entry.subscribers.values()) {
          listener({ status: "error", message: msg });
        }
        return;
      }

      let docToValidate: unknown = rawDocument;
      if (schemaVersion < CURRENT_SCHEMA_VERSION) {
        const migration = migrate(rawDocument, schemaVersion);
        if (!migration.ok) {
          const msg = `Document migration failed: ${migration.reason}`;
          errorStates.set(key, msg);
          for (const listener of entry.subscribers.values()) {
            listener({ status: "error", message: msg });
          }
          return;
        }
        docToValidate = migration.value;
      }

      const validated = validateProjectDocument(docToValidate);
      if (!validated.ok) {
        const msg = "Invalid project document structure";
        errorStates.set(key, msg);
        for (const listener of entry.subscribers.values()) {
          listener({ status: "error", message: msg });
        }
        return;
      }

      // Build thumbnail. Notice: rawDocument and validated.project are discarded immediately after this line.
      const thumbnailData = buildStoryThumbnail(validated.project, thumbOpts);

      // Cache ONLY thumbnailData (A3)
      setInCache(key, thumbnailData);

      // Notify subscribers
      for (const listener of entry.subscribers.values()) {
        listener({ status: "ready", data: thumbnailData });
      }
    } catch {
      const msg = "Preview unavailable";
      errorStates.set(key, msg);
      for (const listener of entry.subscribers.values()) {
        listener({ status: "error", message: msg });
      }
    } finally {
      activeCount--;
      inFlight.delete(key);
      drainQueue();
    }
  }

  function subscribe(
    id: string,
    latestVersion: number,
    listener: (state: ThumbnailLoadState) => void,
  ): () => void {
    const key = makeKey(id, latestVersion);
    const subId = nextSubId++;

    const cached = getFromCache(key);
    if (cached) {
      listener({ status: "ready", data: cached });
      return () => {};
    }

    // Check in-flight
    const existing = inFlight.get(key);
    if (existing) {
      listener({ status: "loading" });
      existing.subscribers.set(subId, listener);
      return () => {
        existing.subscribers.delete(subId);
        if (existing.subscribers.size === 0) {
          existing.abortController.abort();
          inFlight.delete(key);
          const queueIdx = queue.indexOf(existing);
          if (queueIdx !== -1) {
            queue.splice(queueIdx, 1);
          }
        }
      };
    }

    listener({ status: "loading" });
    const abortController = new AbortController();
    const entry: InFlightEntry = {
      id,
      latestVersion,
      abortController,
      subscribers: new Map([[subId, listener]]),
      isActive: false,
    };

    inFlight.set(key, entry);

    if (activeCount < concurrency) {
      entry.isActive = true;
      activeCount++;
      executeEntry(entry);
    } else {
      queue.push(entry);
    }

    return () => {
      entry.subscribers.delete(subId);
      if (entry.subscribers.size === 0) {
        entry.abortController.abort();
        inFlight.delete(key);
        const queueIdx = queue.indexOf(entry);
        if (queueIdx !== -1) {
          queue.splice(queueIdx, 1);
        }
      }
    };
  }

  function get(id: string, latestVersion: number): ThumbnailLoadState | undefined {
    const key = makeKey(id, latestVersion);
    const cached = getFromCache(key);
    if (cached) {
      return { status: "ready", data: cached };
    }
    const err = errorStates.get(key);
    if (err) {
      return { status: "error", message: err };
    }
    if (inFlight.has(key)) {
      return { status: "loading" };
    }
    return undefined;
  }

  function retry(
    id: string,
    latestVersion: number,
    listener: (state: ThumbnailLoadState) => void,
  ): () => void {
    const key = makeKey(id, latestVersion);
    errorStates.delete(key);
    return subscribe(id, latestVersion, listener);
  }

  function clear() {
    cache.clear();
    errorStates.clear();
    for (const entry of inFlight.values()) {
      entry.abortController.abort();
    }
    inFlight.clear();
    queue.length = 0;
    activeCount = 0;
  }

  return {
    subscribe,
    get,
    retry,
    clear,
  };
}
