import { describe, expect, it, vi } from "vitest";

import type { DesignSession } from "@/lib/domain";
import { createFreshSession, updateSession } from "@/lib/session";

import {
  ReferenceLimitError,
  captureAndPersistReference,
  type SessionUpdate,
} from "./capture-client";

const screenshotDataUrl =
  "data:image/jpeg;base64," + btoa("jpeg screenshot bytes");

const capturePayload = {
  url: "https://example.com/",
  screenshotDataUrl,
  elementMetadata: [
    {
      tag: "main",
      text: "Example",
      boundingRegion: { x: 0, y: 0, width: 100, height: 80 },
      selectedStyles: { color: "rgb(0, 0, 0)" },
    },
  ],
};

function makeSession(referenceCount = 0): DesignSession {
  return {
    ...createFreshSession(() => "session-1"),
    references: Array.from({ length: referenceCount }, (_, index) => ({
      id: "reference-" + index,
      url: "https://example.com/" + index,
      screenshotAssetId: "asset-" + index,
      elementMetadata: [],
    })),
  };
}

function successfulFetch() {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(capturePayload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

function idGenerator(...ids: string[]) {
  return vi.fn(() => {
    const id = ids.shift();
    if (!id) throw new Error("No test ID available");
    return id;
  });
}

describe("captureAndPersistReference", () => {
  it("captures, stores the JPEG Blob, and persists ReferenceAsset metadata", async () => {
    const fetchCapture = successfulFetch();
    const writeAsset = vi.fn().mockResolvedValue(undefined);
    const removeAsset = vi.fn().mockResolvedValue(undefined);
    let session = makeSession();
    const update: SessionUpdate = (updater) => {
      session = updateSession(session, updater, undefined);
    };

    const reference = await captureAndPersistReference(
      "https://example.com",
      session,
      update,
      {
        fetch: fetchCapture,
        generateId: idGenerator("reference-new", "asset-new"),
        putAsset: writeAsset,
        deleteAsset: removeAsset,
      },
    );

    expect(fetchCapture).toHaveBeenCalledWith("/api/references/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(writeAsset).toHaveBeenCalledOnce();
    const [sessionId, assetId, blob] = writeAsset.mock.calls[0];
    expect(sessionId).toBe("session-1");
    expect(assetId).toBe("asset-new");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/jpeg");
    expect(await blob.text()).toBe("jpeg screenshot bytes");
    expect(reference).toEqual(session.references[0]);
    expect(session.references[0]).toEqual({
      id: "reference-new",
      url: "https://example.com/",
      screenshotAssetId: "asset-new",
      elementMetadata: capturePayload.elementMetadata,
    });
    expect(removeAsset).not.toHaveBeenCalled();
  });

  it("never persists the screenshot data URL in session JSON", async () => {
    let session = makeSession();
    const update: SessionUpdate = (updater) => {
      session = updateSession(session, updater, undefined);
    };

    await captureAndPersistReference("https://example.com", session, update, {
      fetch: successfulFetch(),
      generateId: idGenerator("reference-new", "asset-new"),
      putAsset: vi.fn().mockResolvedValue(undefined),
      deleteAsset: vi.fn(),
    });

    expect(JSON.stringify(session)).not.toContain("data:image");
    expect(JSON.stringify(session)).not.toContain("jpeg screenshot bytes");
    expect(JSON.stringify(session)).not.toContain("screenshotDataUrl");
  });

  it("does not update the session when the asset write fails", async () => {
    const update = vi.fn<SessionUpdate>();
    const removeAsset = vi.fn();
    const writeError = new Error("IndexedDB write failed");

    await expect(
      captureAndPersistReference("https://example.com", makeSession(), update, {
        fetch: successfulFetch(),
        generateId: idGenerator("reference-new", "asset-new"),
        putAsset: vi.fn().mockRejectedValue(writeError),
        deleteAsset: removeAsset,
      }),
    ).rejects.toBe(writeError);

    expect(update).not.toHaveBeenCalled();
    expect(removeAsset).not.toHaveBeenCalled();
  });

  it("deletes the orphan Blob when the session write fails", async () => {
    const sessionError = new Error("localStorage write failed");
    const removeAsset = vi.fn().mockResolvedValue(undefined);

    await expect(
      captureAndPersistReference(
        "https://example.com",
        makeSession(),
        () => {
          throw sessionError;
        },
        {
          fetch: successfulFetch(),
          generateId: idGenerator("reference-new", "asset-new"),
          putAsset: vi.fn().mockResolvedValue(undefined),
          deleteAsset: removeAsset,
        },
      ),
    ).rejects.toBe(sessionError);

    expect(removeAsset).toHaveBeenCalledOnce();
    expect(removeAsset).toHaveBeenCalledWith("session-1", "asset-new");
  });

  it("deletes session A's asset when the updater receives session B", async () => {
    const sessionA = makeSession();
    const sessionB = {
      ...makeSession(),
      id: "session-2",
    };
    const removeAsset = vi.fn().mockResolvedValue(undefined);
    let updatedSession = sessionB;
    const update: SessionUpdate = (updater) => {
      updatedSession = updater(sessionB);
    };

    await expect(
      captureAndPersistReference(
        "https://example.com",
        sessionA,
        update,
        {
          fetch: successfulFetch(),
          generateId: idGenerator("reference-new", "asset-new"),
          putAsset: vi.fn().mockResolvedValue(undefined),
          deleteAsset: removeAsset,
        },
      ),
    ).rejects.toThrow("Session changed while reference capture was in flight");

    expect(updatedSession).toBe(sessionB);
    expect(updatedSession.references).toHaveLength(0);
    expect(removeAsset).toHaveBeenCalledOnce();
    expect(removeAsset).toHaveBeenCalledWith("session-1", "asset-new");
  });

  it("rejects a fourth reference before capture or asset persistence", async () => {
    const fetchCapture = successfulFetch();
    const writeAsset = vi.fn();
    const update = vi.fn<SessionUpdate>();

    await expect(
      captureAndPersistReference(
        "https://example.com",
        makeSession(3),
        update,
        {
          fetch: fetchCapture,
          putAsset: writeAsset,
        },
      ),
    ).rejects.toBeInstanceOf(ReferenceLimitError);

    expect(fetchCapture).not.toHaveBeenCalled();
    expect(writeAsset).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
