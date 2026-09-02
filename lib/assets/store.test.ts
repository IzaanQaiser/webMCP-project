import { Blob as NodeBlob } from "node:buffer";
import { indexedDB } from "fake-indexeddb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ASSET_DATABASE_NAME,
  MAX_IMAGE_ASSET_BYTES,
} from "./constants";
import {
  clearSessionAssets,
  deleteAsset,
  getAsset,
  putAsset,
} from "./store";

const originalIndexedDb = window.indexedDB;
const originalBlob = globalThis.Blob;

function deleteTestDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(ASSET_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeAll(() => {
  vi.stubGlobal("Blob", NodeBlob);
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
  vi.stubGlobal("Blob", originalBlob);
  vi.unstubAllGlobals();
});

describe("IndexedDB image asset store", () => {
  it("puts and gets an image Blob with its content and metadata intact", async () => {
    const image = new Blob(["image-content"], { type: "image/png" });

    await putAsset("session-1", "asset-1", image);
    const restored = await getAsset("session-1", "asset-1");

    expect(restored).toBeInstanceOf(Blob);
    expect(restored?.type).toBe("image/png");
    expect(restored?.size).toBe(image.size);
    expect(await restored?.text()).toBe("image-content");
  });

  it("isolates the same asset ID across sessions", async () => {
    await putAsset(
      "session-1",
      "shared-asset",
      new Blob(["first"], { type: "image/png" }),
    );
    await putAsset(
      "session-2",
      "shared-asset",
      new Blob(["second"], { type: "image/webp" }),
    );

    expect(await (await getAsset("session-1", "shared-asset"))?.text()).toBe(
      "first",
    );
    expect(await (await getAsset("session-2", "shared-asset"))?.text()).toBe(
      "second",
    );
  });

  it("returns null for a missing asset", async () => {
    expect(await getAsset("session-1", "missing")).toBeNull();
  });

  it("deletes one asset", async () => {
    await putAsset(
      "session-1",
      "asset-1",
      new Blob(["first"], { type: "image/png" }),
    );
    await putAsset(
      "session-1",
      "asset-2",
      new Blob(["second"], { type: "image/png" }),
    );

    await deleteAsset("session-1", "asset-1");

    expect(await getAsset("session-1", "asset-1")).toBeNull();
    expect(await getAsset("session-1", "asset-2")).not.toBeNull();
  });

  it("clears assets for only the target session", async () => {
    const image = new Blob(["image"], { type: "image/png" });
    await putAsset("session-1", "asset-1", image);
    await putAsset("session-1", "asset-2", image);
    await putAsset("session-2", "asset-1", image);

    await clearSessionAssets("session-1");

    expect(await getAsset("session-1", "asset-1")).toBeNull();
    expect(await getAsset("session-1", "asset-2")).toBeNull();
    expect(await getAsset("session-2", "asset-1")).not.toBeNull();
  });

  it("rejects non-image Blobs", async () => {
    await expect(
      putAsset("session-1", "asset-1", new Blob(["text"], { type: "text/plain" })),
    ).rejects.toThrow("image Blob");
  });

  it("rejects oversized images before opening IndexedDB", async () => {
    const open = vi.spyOn(indexedDB, "open");
    const oversized = new Blob([new Uint8Array(MAX_IMAGE_ASSET_BYTES + 1)], {
      type: "image/png",
    });

    await expect(putAsset("session-1", "asset-1", oversized)).rejects.toThrow(
      "exceeds",
    );
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it.each([
    ["", "asset-1"],
    ["   ", "asset-1"],
    ["session-1", ""],
    ["session-1", "   "],
  ])("rejects empty identifiers", async (sessionId, assetId) => {
    await expect(
      putAsset(sessionId, assetId, new Blob(["image"], { type: "image/png" })),
    ).rejects.toThrow("must not be empty");
  });

  it("fails cleanly without accessing IndexedDB on the server", async () => {
    const open = vi.spyOn(indexedDB, "open");
    vi.stubGlobal("window", undefined);

    await expect(getAsset("session-1", "asset-1")).rejects.toThrow(
      "IndexedDB is unavailable",
    );
    expect(open).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    open.mockRestore();
  });
});
