'use client';

import { useAgent } from '@copilotkit/react-core/v2';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Wrapper around CopilotKit's useLangGraphInterrupt for custom UI rendering.
 *
 * CopilotKit's useLangGraphInterrupt renders UI within their chat components.
 * This hook exposes interrupt state for rendering custom UI anywhere.
 *
 * @example
 * const { activeInterrupt, resolve } = useLangGraphInterruptCustomUI<MyType>({
 *   enabled: (value) => value.type === 'my-interrupt-type',
 * });
 *
 * if (activeInterrupt) {
 *   return <MyForm data={activeInterrupt} onSubmit={resolve} />;
 * }
 */
type InterruptEvent = {
  type?: string;
  name?: string;
  value?: unknown;
};

function parseInterruptValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function useLangGraphInterruptCustomUI<T>(options: {
  enabled: (eventValue: unknown) => eventValue is T;
  agentId?: string;
}): {
  activeInterrupt: T | null;
  resolve: (value: string) => void;
  dismiss: () => void;
} {
  const { enabled, agentId } = options;
  const { agent } = useAgent({ agentId });
  const [activeInterrupt, setActiveInterrupt] = useState<T | null>(null);
  const activeInterruptRef = useRef<T | null>(null);
  const lastResolvedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    activeInterruptRef.current = activeInterrupt;
  }, [activeInterrupt]);

  const interruptKey = useCallback((value: unknown): string | null => {
    if (typeof value !== 'object' || value === null) return null;
    const candidate = value as Record<string, unknown>;
    const type = typeof candidate.type === 'string' ? candidate.type : '';
    const message = typeof candidate.message === 'string' ? candidate.message : '';
    const artifactId = typeof candidate.artifactId === 'string' ? candidate.artifactId : '';
    const chainId = typeof candidate.chainId === 'number' ? String(candidate.chainId) : '';
    const optionsLen = Array.isArray(candidate.options) ? String(candidate.options.length) : '';
    const delegationsLen = Array.isArray(candidate.delegationsToSign)
      ? String(candidate.delegationsToSign.length)
      : '';
    return [type, message, artifactId, chainId, optionsLen, delegationsLen].join('|');
  }, []);

  useEffect(() => {
    if (!agent) {
      return;
    }

    const { unsubscribe } = agent.subscribe({
      onEvent: ({ event }) => {
        const customEvent = event as InterruptEvent;
        if (customEvent.type !== 'CUSTOM' || customEvent.name !== 'on_interrupt') {
          return;
        }

        const parsed = parseInterruptValue(customEvent.value);
        if (!enabled(parsed)) {
          return;
        }

        const key = interruptKey(parsed);
        if (key && key === lastResolvedKeyRef.current) {
          return;
        }

        const activeKey = interruptKey(activeInterruptRef.current);
        if (!activeInterruptRef.current || (key && activeKey && key !== activeKey)) {
          lastResolvedKeyRef.current = null;
          setActiveInterrupt(parsed);
        }
      },
      onRunStartedEvent: () => {
        lastResolvedKeyRef.current = null;
      },
    });

    return () => {
      unsubscribe();
    };
  }, [agent, enabled, interruptKey]);

  const resolve = useCallback(
    (value: string) => {
      lastResolvedKeyRef.current = interruptKey(activeInterruptRef.current);
      void agent.runAgent({ forwardedProps: { command: { resume: value } } });
      setActiveInterrupt(null);
    },
    [agent, interruptKey],
  );

  const dismiss = useCallback(() => {
    lastResolvedKeyRef.current = interruptKey(activeInterruptRef.current);
    setActiveInterrupt(null);
  }, [interruptKey]);

  return { activeInterrupt, resolve, dismiss };
}
