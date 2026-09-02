"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { DesignSession, SourceSite } from "@/lib/domain";

import {
  appendVersion as appendSessionVersion,
  createFreshSession,
  getBrowserSessionStorage,
  loadSession,
  resetSession,
  updateSession,
  type SessionUpdater,
} from "./store";

interface SessionContextValue {
  session: DesignSession;
  update: (updater: SessionUpdater) => void;
  reset: () => void;
  appendVersion: (source: SourceSite, reason: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(createFreshSession);
  const sessionRef = useRef(session);

  const commit = useCallback((nextSession: DesignSession) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  useEffect(() => {
    let isActive = true;

    queueMicrotask(() => {
      if (isActive) {
        commit(loadSession());
      }
    });

    return () => {
      isActive = false;
    };
  }, [commit]);

  const update = useCallback(
    (updater: SessionUpdater) => {
      commit(
        updateSession(
          sessionRef.current,
          updater,
          getBrowserSessionStorage(),
        ),
      );
    },
    [commit],
  );

  const reset = useCallback(() => {
    commit(resetSession(getBrowserSessionStorage()));
  }, [commit]);

  const appendVersion = useCallback(
    (source: SourceSite, reason: string) => {
      commit(
        appendSessionVersion(
          sessionRef.current,
          source,
          reason,
          getBrowserSessionStorage(),
        ),
      );
    },
    [commit],
  );

  return (
    <SessionContext.Provider value={{ session, update, reset, appendVersion }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }

  return context;
}
