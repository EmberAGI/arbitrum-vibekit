'use client';

import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';

import type { ThreadSnapshot } from '../types/agent';

type AuthoritativeAgentSnapshotCache = {
  getSnapshot: (key: string) => ThreadSnapshot | null;
  setSnapshot: (key: string, snapshot: ThreadSnapshot) => void;
};

const noopCache: AuthoritativeAgentSnapshotCache = {
  getSnapshot: () => null,
  setSnapshot: () => undefined,
};

const AuthoritativeAgentSnapshotCacheContext =
  createContext<AuthoritativeAgentSnapshotCache>(noopCache);

export function AuthoritativeAgentSnapshotCacheProvider({
  children,
}: {
  children: ReactNode;
}) {
  const snapshotsRef = useRef(new Map<string, ThreadSnapshot>());

  const value = useMemo<AuthoritativeAgentSnapshotCache>(
    () => ({
      getSnapshot: (key) => snapshotsRef.current.get(key) ?? null,
      setSnapshot: (key, snapshot) => {
        snapshotsRef.current.set(key, structuredClone(snapshot));
      },
    }),
    [],
  );

  return (
    <AuthoritativeAgentSnapshotCacheContext.Provider value={value}>
      {children}
    </AuthoritativeAgentSnapshotCacheContext.Provider>
  );
}

export function useAuthoritativeAgentSnapshotCache(): AuthoritativeAgentSnapshotCache {
  return useContext(AuthoritativeAgentSnapshotCacheContext);
}
