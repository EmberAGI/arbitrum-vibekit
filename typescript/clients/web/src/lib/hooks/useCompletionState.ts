"use client";

import { useState, useCallback, useRef } from "react";

export interface CompletionState {
  completions: Record<string, string[]>;
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
}

export function useCompletionState(
  handleCompletion?: (
    ref: any,
    argName: string,
    value: string,
    context?: Record<string, string>,
    signal?: AbortSignal
  ) => Promise<string[]>,
  enabled: boolean = true
) {
  const [completions, setCompletions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const requestCompletions = useCallback(
    async (
      ref: any,
      argName: string,
      value: string,
      context?: Record<string, string>
    ) => {
      if (!enabled || !handleCompletion) {
        return;
      }

      // Cancel any existing request for this parameter
      const existingController = abortControllersRef.current.get(argName);
      if (existingController) {
        existingController.abort();
      }

      // Create new abort controller
      const controller = new AbortController();
      abortControllersRef.current.set(argName, controller);

      setLoading((prev) => ({ ...prev, [argName]: true }));
      setErrors((prev) => ({ ...prev, [argName]: null }));

      try {
        const results = await handleCompletion(
          ref,
          argName,
          value,
          context,
          controller.signal
        );

        if (!controller.signal.aborted) {
          setCompletions((prev) => ({ ...prev, [argName]: results }));
        }
      } catch (error: any) {
        if (!controller.signal.aborted) {
          setErrors((prev) => ({
            ...prev,
            [argName]: error.message || "Completion failed",
          }));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading((prev) => ({ ...prev, [argName]: false }));
          abortControllersRef.current.delete(argName);
        }
      }
    },
    [enabled, handleCompletion]
  );

  const clearError = useCallback((argName: string) => {
    setErrors((prev) => ({ ...prev, [argName]: null }));
  }, []);

  return {
    completions,
    loading,
    errors,
    requestCompletions,
    clearError,
  };
}

