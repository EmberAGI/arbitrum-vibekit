'use client';

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { ThreadSnapshot } from '../types/agent';

type AuthoritativeAgentSnapshotCache = {
  getSnapshot: (key: string) => ThreadSnapshot | null;
  setSnapshot: (key: string, snapshot: ThreadSnapshot) => void;
  getVersion: () => number;
  subscribe: (listener: () => void) => () => void;
};

const noopCache: AuthoritativeAgentSnapshotCache = {
  getSnapshot: () => null,
  setSnapshot: () => undefined,
  getVersion: () => 0,
  subscribe: () => () => undefined,
};

const AuthoritativeAgentSnapshotCacheContext =
  createContext<AuthoritativeAgentSnapshotCache>(noopCache);

export function AuthoritativeAgentSnapshotCacheProvider({
  children,
}: {
  children: ReactNode;
}) {
  const snapshotsRef = useRef(new Map<string, ThreadSnapshot>());
  const versionRef = useRef(0);
  const listenersRef = useRef(new Set<() => void>());

  const value = useMemo<AuthoritativeAgentSnapshotCache>(
    () => ({
      getSnapshot: (key) => snapshotsRef.current.get(key) ?? null,
      setSnapshot: (key, snapshot) => {
        snapshotsRef.current.set(key, structuredClone(snapshot));
        versionRef.current += 1;
        listenersRef.current.forEach((listener) => listener());
      },
      getVersion: () => versionRef.current,
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
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

export function useAuthoritativeAgentSnapshotCacheVersion(): number {
  const cache = useAuthoritativeAgentSnapshotCache();
  return useSyncExternalStore(cache.subscribe, cache.getVersion, cache.getVersion);
}
