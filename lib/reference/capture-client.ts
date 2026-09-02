import { deleteAsset, putAsset } from "@/lib/assets";
import {
  MAX_REFERENCES_PER_SESSION,
  ReferenceAssetSchema,
  type DesignSession,
  type ReferenceAsset,
} from "@/lib/domain";
import type { SessionUpdater } from "@/lib/session";

const CAPTURE_ENDPOINT = "/api/references/capture";
const JPEG_DATA_URL_PREFIX = "data:image/jpeg;base64,";

export type SessionUpdate = (updater: SessionUpdater) => void;

export interface CaptureReferenceClientDependencies {
  fetch?: typeof fetch;
  generateId?: () => string;
  putAsset?: typeof putAsset;
  deleteAsset?: typeof deleteAsset;
}

export class ReferenceLimitError extends Error {
  constructor() {
    super(
      "A session can contain at most " +
        MAX_REFERENCES_PER_SESSION +
        " references",
    );
    this.name = "ReferenceLimitError";
  }
}

function decodeJpegDataUrl(dataUrl: unknown): Blob {
  if (
    typeof dataUrl !== "string" ||
    !dataUrl.startsWith(JPEG_DATA_URL_PREFIX)
  ) {
    throw new TypeError("Capture response must contain a JPEG data URL");
  }

  const encoded = dataUrl.slice(JPEG_DATA_URL_PREFIX.length);
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: "image/jpeg" });
}

function requireCapturePayload(payload: unknown): {
  url: unknown;
  screenshotDataUrl: unknown;
  elementMetadata: unknown;
} {
  if (typeof payload !== "object" || payload === null) {
    throw new TypeError("Capture response is invalid");
  }

  const candidate = payload as Record<string, unknown>;
  return {
    url: candidate.url,
    screenshotDataUrl: candidate.screenshotDataUrl,
    elementMetadata: candidate.elementMetadata,
  };
}

export async function captureAndPersistReference(
  url: string,
  session: DesignSession,
  update: SessionUpdate,
  dependencies: CaptureReferenceClientDependencies = {},
): Promise<ReferenceAsset> {
  if (session.references.length >= MAX_REFERENCES_PER_SESSION) {
    throw new ReferenceLimitError();
  }

  const fetchCapture = dependencies.fetch ?? globalThis.fetch;
  const generateId = dependencies.generateId ?? (() => crypto.randomUUID());
  const writeAsset = dependencies.putAsset ?? putAsset;
  const removeAsset = dependencies.deleteAsset ?? deleteAsset;

  const response = await fetchCapture(CAPTURE_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error("Reference capture failed");
  }

  const capture = requireCapturePayload(await response.json());
  const screenshot = decodeJpegDataUrl(capture.screenshotDataUrl);
  const referenceId = generateId();
  const assetId = generateId();
  const reference = ReferenceAssetSchema.parse({
    id: referenceId,
    url: capture.url,
    screenshotAssetId: assetId,
    elementMetadata: capture.elementMetadata,
  });

  await writeAsset(session.id, assetId, screenshot);

  try {
    update((currentSession) => {
      if (currentSession.id !== session.id) {
        throw new Error("Session changed while reference capture was in flight");
      }

      if (currentSession.references.length >= MAX_REFERENCES_PER_SESSION) {
        throw new ReferenceLimitError();
      }

      return {
        ...currentSession,
        references: [...currentSession.references, reference],
      };
    });
  } catch (sessionError) {
    try {
      await removeAsset(session.id, assetId);
    } catch (cleanupError) {
      throw new AggregateError(
        [sessionError, cleanupError],
        "Session update failed and the orphan asset could not be removed",
      );
    }

    throw sessionError;
  }

  return reference;
}
