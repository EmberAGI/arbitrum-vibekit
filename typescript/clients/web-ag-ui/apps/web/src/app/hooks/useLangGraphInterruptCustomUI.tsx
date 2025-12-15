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
  const pendingInterruptRef = useRef<T | null>(null);
  const resolveRef = useRef<((value: string) => void) | null>(null);
  const resolvedRef = useRef(false);

  useLangGraphInterrupt<T>({
    enabled: ({ eventValue }) => {
      const isMatch = options.enabled(eventValue);
      if (isMatch && !resolvedRef.current) {
        pendingInterruptRef.current = eventValue;
      }
      return isMatch;
    },
    render: ({ resolve }) => {
      resolveRef.current = resolve;
      resolvedRef.current = false;
      return <></>;
    },
  });

  useEffect(() => {
    const checkInterrupt = () => {
      if (pendingInterruptRef.current && !activeInterrupt && !resolvedRef.current) {
        setActiveInterrupt(pendingInterruptRef.current);
        pendingInterruptRef.current = null;
      }
    };
    checkInterrupt();
    const interval = setInterval(checkInterrupt, 100);
    return () => clearInterval(interval);
  }, [activeInterrupt]);

  const resolve = useCallback((value: string) => {
    resolvedRef.current = true;
    if (resolveRef.current) {
      resolveRef.current(value);
    }
    setActiveInterrupt(null);
    pendingInterruptRef.current = null;
  }, []);

  const dismiss = useCallback(() => {
    resolvedRef.current = true;
    setActiveInterrupt(null);
    pendingInterruptRef.current = null;
    resolveRef.current = null;
  }, []);

  return { activeInterrupt, resolve, dismiss };
}
