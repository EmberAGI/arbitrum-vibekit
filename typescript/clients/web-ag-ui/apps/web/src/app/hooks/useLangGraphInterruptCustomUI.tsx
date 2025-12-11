import { useLangGraphInterrupt } from '@copilotkit/react-core';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A wrapper around CopilotKit's useLangGraphInterrupt that supports custom UI rendering.
 *
 * CopilotKit's useLangGraphInterrupt is designed to render interrupt UI within their chat
 * components (CopilotSidebar, etc). This hook provides the same AG-UI protocol interrupt
 * detection but allows rendering custom UI anywhere in your component tree.
 *
 * @example
 * ```tsx
 * const { activeInterrupt, resolve, dismiss } = useLangGraphInterruptCustomUI<MyInterruptType>({
 *   enabled: (value) => value.type === 'my-interrupt-type',
 * });
 *
 * if (activeInterrupt) {
 *   return <MyCustomForm data={activeInterrupt} onSubmit={resolve} onCancel={dismiss} />;
 * }
 * ```
 */
export function useLangGraphInterruptCustomUI<T>(options: {
  /**
   * Predicate to determine if this hook should handle the interrupt.
   * Receives the interrupt event value from the LangGraph agent.
   */
  enabled: (eventValue: unknown) => eventValue is T;
}): {
  /** The currently active interrupt data, or null if no interrupt is pending */
  activeInterrupt: T | null;
  /** Call this with the response value to resume the LangGraph execution */
  resolve: (value: string) => void;
  /** Call this to dismiss the interrupt without providing a response */
  dismiss: () => void;
} {
  const [activeInterrupt, setActiveInterrupt] = useState<T | null>(null);
  const pendingInterruptRef = useRef<T | null>(null);
  const resolveRef = useRef<((value: string) => void) | null>(null);
  // Track resolved state to prevent re-activation from stale enabled() calls
  const resolvedRef = useRef(false);

  // Use CopilotKit's hook to detect interrupts via AG-UI protocol
  useLangGraphInterrupt<T>({
    enabled: ({ eventValue }) => {
      const isMatch = options.enabled(eventValue);
      if (isMatch && !resolvedRef.current) {
        // Store in ref (safe during render), will sync to state via effect
        // Only store if we haven't already resolved this interrupt
        pendingInterruptRef.current = eventValue;
      }
      return isMatch;
    },
    render: ({ resolve }) => {
      // Capture the resolve function when render is called
      console.log('[useLangGraphInterruptCustomUI] render callback called, capturing resolve');
      resolveRef.current = resolve;
      // Reset resolved flag when we get a fresh render callback (new interrupt)
      resolvedRef.current = false;
      // Return empty fragment - our custom UI renders elsewhere
      return <></>;
    },
  });

  // Sync ref to state outside of render cycle
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
    console.log('[useLangGraphInterruptCustomUI] resolve called', {
      hasResolveRef: !!resolveRef.current,
      value,
    });
    // Mark as resolved BEFORE clearing state to prevent race conditions
    resolvedRef.current = true;
    if (resolveRef.current) {
      // Use CopilotKit's resolve if available (proper AG-UI protocol)
      resolveRef.current(value);
      console.log('[useLangGraphInterruptCustomUI] Called CopilotKit resolve');
    } else {
      console.warn(
        '[useLangGraphInterruptCustomUI] resolveRef is null - interrupt response may not be sent. ' +
          'Ensure a CopilotKit chat component (CopilotPopup, CopilotSidebar, etc.) is mounted.',
      );
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
