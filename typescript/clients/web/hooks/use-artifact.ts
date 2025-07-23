'use client';

import useSWR from 'swr';
import type { UIArtifact as OriginalUIArtifact } from '@/components/artifact';
import { useCallback, useMemo } from 'react';

export type SidepanelMode = 'default' | 'fullscreen';

// Extend the original UIArtifact type to include sidepanel mode
export interface UIArtifact extends OriginalUIArtifact {
  sidepanelMode?: SidepanelMode;
}

export const initialArtifactData: UIArtifact = {
  documentId: 'init',
  content: '',
  kind: 'text',
  title: '',
  status: 'idle',
  isVisible: false,
  boundingBox: {
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  },
  sidepanelMode: 'default', // Default to 33% width mode
};

type Selector<T> = (state: UIArtifact) => T;

export function useArtifactSelector<Selected>(selector: Selector<Selected>) {
  const { data: localArtifact } = useSWR<UIArtifact>('artifact', null, {
    fallbackData: initialArtifactData,
  });

  const selectedValue = useMemo(() => {
    if (!localArtifact) return selector(initialArtifactData);
    return selector(localArtifact);
  }, [localArtifact, selector]);

  return selectedValue;
}

export function useArtifact() {
  const { data: localArtifact, mutate: setLocalArtifact } = useSWR<UIArtifact>(
    'artifact',
    null,
    {
      fallbackData: initialArtifactData,
    },
  );

  const artifact = useMemo(() => {
    if (!localArtifact) return initialArtifactData;
    return localArtifact;
  }, [localArtifact]);

  const setArtifact = useCallback(
    (updaterFn: UIArtifact | ((currentArtifact: UIArtifact) => UIArtifact)) => {
      setLocalArtifact((currentArtifact) => {
        const artifactToUpdate = currentArtifact || initialArtifactData;

        if (typeof updaterFn === 'function') {
          return updaterFn(artifactToUpdate);
        }

        return updaterFn;
      });
    },
    [setLocalArtifact],
  );

  // Add sidepanel mode controls
  const toggleSidepanelMode = useCallback(() => {
    setArtifact((current) => ({
      ...current,
      sidepanelMode: current.sidepanelMode === 'default' ? 'fullscreen' : 'default',
    }));
  }, [setArtifact]);

  const setSidepanelMode = useCallback((mode: SidepanelMode) => {
    setArtifact((current) => ({
      ...current,
      sidepanelMode: mode,
    }));
  }, [setArtifact]);

  const { data: localArtifactMetadata, mutate: setLocalArtifactMetadata } =
    useSWR<any>(
      () =>
        artifact.documentId ? `artifact-metadata-${artifact.documentId}` : null,
      null,
      {
        fallbackData: null,
      },
    );

  return useMemo(
    () => ({
      artifact,
      setArtifact,
      metadata: localArtifactMetadata,
      setMetadata: setLocalArtifactMetadata,
      toggleSidepanelMode,
      setSidepanelMode,
    }),
    [artifact, setArtifact, localArtifactMetadata, setLocalArtifactMetadata, toggleSidepanelMode, setSidepanelMode],
  );
}
