import { indexedDB } from "fake-indexeddb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ASSET_DATABASE_NAME,
  getAsset,
  putAsset,
} from "@/lib/assets";
import type { DesignSession } from "@/lib/domain";

import { AssetCleanupError, resetBrowserSession } from "./browser-reset";
import {
  createFreshSession,
  loadSession,
  persistSession,
  type SessionStorage,
} from "./store";

class MemoryStorage implements SessionStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const originalIndexedDb = window.indexedDB;

function deleteTestDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(ASSET_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeAll(() => {
  Object.defineProperty(window, "indexedDB", {
    configurable: true,
    value: indexedDB,
  });
});

beforeEach(async () => {
  await deleteTestDatabase();
});

afterAll(async () => {
  await deleteTestDatabase();
  Object.defineProperty(window, "indexedDB", {
    configurable: true,
    value: originalIndexedDb,
  });
});

describe("canonical browser reset", () => {
  it("clears the old session assets and commits a fresh session ID", async () => {
    const storage = new MemoryStorage();
    const oldSession = createFreshSession(() => "session-old");
    persistSession(oldSession, storage);
    await putAsset(
      oldSession.id,
      "asset-1",
      new Blob(["screenshot"], { type: "image/png" }),
    );
    let committed: DesignSession | undefined;

    await resetBrowserSession(
      oldSession.id,
      (session) => {
        committed = session;
      },
      { storage, generateId: () => "session-new" },
    );

    expect(await getAsset("session-old", "asset-1")).toBeNull();
    expect(committed?.id).toBe("session-new");
    expect(committed?.id).not.toBe(oldSession.id);
    expect(loadSession(storage)).toEqual(committed);
  });

  it("still resets structured state and reports an asset cleanup failure", async () => {
    const storage = new MemoryStorage();
    const oldSession = {
      ...createFreshSession(() => "session-old"),
      sourceSite: {
        html: "<main>Old session</main>",
        css: "main { display: block; }",
      },
    };
    persistSession(oldSession, storage);
    let committed: DesignSession | undefined;
    const clearAssets = vi.fn(async () => {
      throw new Error("cleanup unavailable");
    });

    await expect(
      resetBrowserSession(
        oldSession.id,
        (session) => {
          committed = session;
        },
        {
          storage,
          generateId: () => "session-after-failure",
          clearAssets,
        },
      ),
    ).rejects.toBeInstanceOf(AssetCleanupError);

    expect(clearAssets).toHaveBeenCalledWith("session-old");
    expect(committed).toEqual(
      createFreshSession(() => "session-after-failure"),
    );
    expect(loadSession(storage)).toEqual(committed);
  });
});
