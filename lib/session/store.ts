import {
  DesignSessionSchema,
  SiteVersionSchema,
  SourceSiteSchema,
  type DesignSession,
  type SourceSite,
} from "@/lib/domain";

import {
  DESIGN_SESSION_STORAGE_KEY,
  SITE_VERSION_HISTORY_LIMIT,
} from "./constants";

export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type IdGenerator = () => string;
export type SessionUpdater = (session: DesignSession) => DesignSession;

export const generateSessionId: IdGenerator = () => crypto.randomUUID();

export function getBrowserSessionStorage(): SessionStorage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function createFreshSession(
  generateId: IdGenerator = generateSessionId,
): DesignSession {
  return DesignSessionSchema.parse({
    id: generateId(),
    sourceSite: null,
    references: [],
    preferences: [],
    unresolvedIntents: [],
    designContract: null,
    feedback: [],
    lockedElements: [],
    versions: [],
  });
}

export function loadSession(
  storage: SessionStorage | undefined = getBrowserSessionStorage(),
  generateId: IdGenerator = generateSessionId,
): DesignSession {
  if (!storage) {
    return createFreshSession(generateId);
  }

  let storedValue: string | null;

  try {
    storedValue = storage.getItem(DESIGN_SESSION_STORAGE_KEY);
  } catch {
    return createFreshSession(generateId);
  }

  if (storedValue === null) {
    return createFreshSession(generateId);
  }

  try {
    return DesignSessionSchema.parse(JSON.parse(storedValue));
  } catch {
    storage.removeItem(DESIGN_SESSION_STORAGE_KEY);
    return createFreshSession(generateId);
  }
}

export function persistSession(
  session: DesignSession,
  storage: SessionStorage | undefined = getBrowserSessionStorage(),
): DesignSession {
  const validSession = DesignSessionSchema.parse(session);

  if (storage) {
    storage.setItem(
      DESIGN_SESSION_STORAGE_KEY,
      JSON.stringify(validSession),
    );
  }

  return validSession;
}

export function updateSession(
  session: DesignSession,
  updater: SessionUpdater,
  storage: SessionStorage | undefined = getBrowserSessionStorage(),
): DesignSession {
  const validCurrentSession = DesignSessionSchema.parse(session);
  const isolatedSession = structuredClone(validCurrentSession);
  const nextSession = DesignSessionSchema.parse(updater(isolatedSession));

  return persistSession(nextSession, storage);
}

export function resetSession(
  storage: SessionStorage | undefined = getBrowserSessionStorage(),
  generateId: IdGenerator = generateSessionId,
): DesignSession {
  const freshSession = createFreshSession(generateId);

  if (storage) {
    storage.removeItem(DESIGN_SESSION_STORAGE_KEY);
  }

  return persistSession(freshSession, storage);
}

export function appendVersion(
  session: DesignSession,
  source: SourceSite,
  reason: string,
  storage: SessionStorage | undefined = getBrowserSessionStorage(),
  generateId: IdGenerator = generateSessionId,
): DesignSession {
  const validSource = SourceSiteSchema.parse(source);
  const version = SiteVersionSchema.parse({
    id: generateId(),
    reason,
    sourceSite: validSource,
  });

  return updateSession(
    session,
    (currentSession) => ({
      ...currentSession,
      versions: [...currentSession.versions, version].slice(
        -SITE_VERSION_HISTORY_LIMIT,
      ),
    }),
    storage,
  );
}
