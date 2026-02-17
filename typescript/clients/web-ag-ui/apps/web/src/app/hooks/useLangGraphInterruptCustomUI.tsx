import { useLangGraphInterrupt } from '@copilotkit/react-core';
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
export function useLangGraphInterruptCustomUI<T>(options: {
  enabled: (eventValue: unknown) => eventValue is T;
}): {
  activeInterrupt: T | null;
  resolve: (value: string) => void;
  dismiss: () => void;
} {
  const [activeInterrupt, setActiveInterrupt] = useState<T | null>(null);
  const activeInterruptRef = useRef<T | null>(null);
  const pendingInterruptRef = useRef<T | null>(null);
  const resolveRef = useRef<((value: string) => void) | null>(null);
  const lastResolvedKeyRef = useRef<string | null>(null);
  const pendingScheduleRef = useRef(false);

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

  const promotePendingInterrupt = useCallback(() => {
    const pending = pendingInterruptRef.current;
    if (!pending) return;

    const pendingKey = interruptKey(pending);
    if (pendingKey && pendingKey === lastResolvedKeyRef.current) {
      pendingInterruptRef.current = null;
      return;
    }

    const activeKey = interruptKey(activeInterruptRef.current);
    if (!activeInterruptRef.current || (pendingKey && activeKey && pendingKey !== activeKey)) {
      lastResolvedKeyRef.current = null;
      setActiveInterrupt(pending);
    }

    pendingInterruptRef.current = null;
  }, [interruptKey]);

  useLangGraphInterrupt<T>({
    enabled: ({ eventValue }) => {
      const isMatch = options.enabled(eventValue);
      if (!isMatch) return false;

      const key = interruptKey(eventValue);
      if (key && key === lastResolvedKeyRef.current) {
        return false;
      }

      const activeKey = interruptKey(activeInterruptRef.current);
      if (key && activeKey && key === activeKey) {
        return true;
      }

      pendingInterruptRef.current = eventValue;
      if (!pendingScheduleRef.current) {
        pendingScheduleRef.current = true;
        setTimeout(() => {
          pendingScheduleRef.current = false;
          promotePendingInterrupt();
        }, 0);
      }

      return true;
    },
    render: ({ resolve }) => {
      resolveRef.current = resolve;
      return <></>;
    },
  });

  const resolve = useCallback(
    (value: string) => {
      lastResolvedKeyRef.current = interruptKey(activeInterruptRef.current);
      if (resolveRef.current) {
        resolveRef.current(value);
      }
      setActiveInterrupt(null);
      pendingInterruptRef.current = null;
    },
    [interruptKey],
  );

  const dismiss = useCallback(() => {
    lastResolvedKeyRef.current = interruptKey(activeInterruptRef.current);
    setActiveInterrupt(null);
    pendingInterruptRef.current = null;
    resolveRef.current = null;
  }, [interruptKey]);

  return { activeInterrupt, resolve, dismiss };
}
