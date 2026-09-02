import { afterEach, describe, expect, it, vi } from "vitest";

import { DesignSessionSchema, type ReferenceAsset } from "@/lib/domain";

import {
  DESIGN_SESSION_STORAGE_KEY,
  SITE_VERSION_HISTORY_LIMIT,
} from "./constants";
import {
  appendVersion,
  createFreshSession,
  loadSession,
  persistSession,
  resetSession,
  updateSession,
  type SessionStorage,
} from "./store";

class MemoryStorage implements SessionStorage {
  readonly values = new Map<string, string>();
  readonly removeItem = vi.fn((key: string) => {
    this.values.delete(key);
  });
  readonly setItem = vi.fn((key: string, value: string) => {
    this.values.set(key, value);
  });
  readonly getItem = vi.fn((key: string) => this.values.get(key) ?? null);
}

const sourceSite = {
  html: "<main><h1>Version</h1></main>",
  css: "main { display: grid; }",
};

const idGenerator = (prefix = "id") => {
  let nextId = 0;
  return () => `${prefix}-${++nextId}`;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("structured session store", () => {
  it("creates a valid fresh session through an injectable ID boundary", () => {
    const session = createFreshSession(() => "session-controlled");

    expect(session).toEqual({
      id: "session-controlled",
      sourceSite: null,
      references: [],
      preferences: [],
      unresolvedIntents: [],
      designContract: null,
      feedback: [],
      lockedElements: [],
      versions: [],
    });
    expect(DesignSessionSchema.safeParse(session).success).toBe(true);
  });

  it("resets persisted state to a clean valid session", () => {
    const storage = new MemoryStorage();
    const existing = createFreshSession(() => "session-existing");
    persistSession({ ...existing, sourceSite }, storage);

    const reset = resetSession(storage, () => "session-reset");

    expect(reset).toEqual(createFreshSession(() => "session-reset"));
    expect(storage.removeItem).toHaveBeenCalledWith(
      DESIGN_SESSION_STORAGE_KEY,
    );
    expect(loadSession(storage)).toEqual(reset);
  });

  it("round-trips a valid session through storage", () => {
    const storage = new MemoryStorage();
    const session = {
      ...createFreshSession(() => "session-round-trip"),
      sourceSite,
    };

    persistSession(session, storage);

    expect(loadSession(storage)).toEqual(session);
  });

  it("removes malformed JSON and returns a fresh session", () => {
    const storage = new MemoryStorage();
    storage.values.set(DESIGN_SESSION_STORAGE_KEY, "{not-json");

    const session = loadSession(storage, () => "session-after-malformed");

    expect(session.id).toBe("session-after-malformed");
    expect(storage.removeItem).toHaveBeenCalledWith(
      DESIGN_SESSION_STORAGE_KEY,
    );
    expect(storage.values.has(DESIGN_SESSION_STORAGE_KEY)).toBe(false);
  });

  it("removes schema-invalid JSON and returns a fresh session", () => {
    const storage = new MemoryStorage();
    storage.values.set(
      DESIGN_SESSION_STORAGE_KEY,
      JSON.stringify({ id: "invalid-session" }),
    );

    const session = loadSession(storage, () => "session-after-invalid");

    expect(session.id).toBe("session-after-invalid");
    expect(storage.removeItem).toHaveBeenCalledWith(
      DESIGN_SESSION_STORAGE_KEY,
    );
    expect(storage.values.has(DESIGN_SESSION_STORAGE_KEY)).toBe(false);
  });

  it("updates immutably and persists the valid result", () => {
    const storage = new MemoryStorage();
    const current = createFreshSession(() => "session-update");

    const updated = updateSession(
      current,
      (isolated) => ({ ...isolated, sourceSite }),
      storage,
    );

    expect(updated).not.toBe(current);
    expect(updated.sourceSite).toEqual(sourceSite);
    expect(current.sourceSite).toBeNull();
    expect(loadSession(storage)).toEqual(updated);
  });

  it("does not persist an invalid update", () => {
    const storage = new MemoryStorage();
    const current = createFreshSession(() => "session-invalid-update");

    expect(() =>
      updateSession(
        current,
        (isolated) =>
          ({ ...isolated, sourceSite: { html: "", css: "" } }) as never,
        storage,
      ),
    ).toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.values.has(DESIGN_SESSION_STORAGE_KEY)).toBe(false);
  });

  it("appends a version immutably with its reason and source", () => {
    const storage = new MemoryStorage();
    const current = createFreshSession(() => "session-version");

    const updated = appendVersion(
      current,
      sourceSite,
      "Captured source",
      storage,
      () => "version-1",
    );

    expect(updated).not.toBe(current);
    expect(current.versions).toEqual([]);
    expect(updated.versions).toEqual([
      {
        id: "version-1",
        reason: "Captured source",
        sourceSite,
      },
    ]);
    expect(loadSession(storage)).toEqual(updated);
  });

  it("retains only the newest versions at the history cap", () => {
    const storage = new MemoryStorage();
    let session = createFreshSession(() => "session-history");
    const generateVersionId = idGenerator("version");

    for (let index = 1; index <= SITE_VERSION_HISTORY_LIMIT + 2; index += 1) {
      session = appendVersion(
        session,
        {
          html: `<main>Version ${index}</main>`,
          css: `main { order: ${index}; }`,
        },
        `Revision ${index}`,
        storage,
        generateVersionId,
      );
    }

    expect(session.versions).toHaveLength(SITE_VERSION_HISTORY_LIMIT);
    expect(session.versions[0].id).toBe("version-3");
    expect(session.versions.at(-1)?.id).toBe("version-12");
  });

  it("persists screenshot references by ID without binary payloads", () => {
    const storage = new MemoryStorage();
    const reference: ReferenceAsset = {
      id: "reference-1",
      url: "https://example.com/reference",
      screenshotAssetId: "asset-1",
      elementMetadata: [],
    };
    const session = {
      ...createFreshSession(() => "session-reference"),
      references: [reference],
    };

    persistSession(session, storage);

    const stored = storage.values.get(DESIGN_SESSION_STORAGE_KEY);
    expect(stored).toBeDefined();
    expect(stored).toContain('"screenshotAssetId":"asset-1"');
    expect(stored).not.toMatch(/data:image|;base64|screenshotBytes|blob|arrayBuffer/i);
  });

  it("does not access localStorage without a window", () => {
    vi.stubGlobal("window", undefined);
    const localStorageAccess = vi.fn(() => {
      throw new Error("localStorage must not be accessed");
    });
    vi.stubGlobal("localStorage", localStorageAccess);

    expect(() => loadSession(undefined, () => "session-server")).not.toThrow();
    expect(localStorageAccess).not.toHaveBeenCalled();
  });
});
