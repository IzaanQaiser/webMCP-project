import { clearSessionAssets } from "@/lib/assets";
import type { DesignSession } from "@/lib/domain";

import {
  generateSessionId,
  getBrowserSessionStorage,
  resetSession,
  type IdGenerator,
  type SessionStorage,
} from "./store";

type SessionCommit = (session: DesignSession) => void;
type AssetCleanup = (sessionId: string) => Promise<void>;

interface BrowserResetDependencies {
  storage?: SessionStorage;
  generateId?: IdGenerator;
  clearAssets?: AssetCleanup;
}

export class AssetCleanupError extends Error {
  constructor(cause: unknown) {
    super("Asset cleanup failed after structured session reset completed", {
      cause,
    });
    this.name = "AssetCleanupError";
  }
}

export async function resetBrowserSession(
  oldSessionId: string,
  commit: SessionCommit,
  dependencies: BrowserResetDependencies = {},
): Promise<void> {
  const {
    storage = getBrowserSessionStorage(),
    generateId = generateSessionId,
    clearAssets = clearSessionAssets,
  } = dependencies;
  let cleanupFailure: unknown;

  try {
    await clearAssets(oldSessionId);
  } catch (error) {
    cleanupFailure = error;
  }

  const freshSession = resetSession(storage, generateId);
  commit(freshSession);

  if (cleanupFailure !== undefined) {
    throw new AssetCleanupError(cleanupFailure);
  }
}
