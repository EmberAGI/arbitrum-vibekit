'use client';

import { useEffect, useRef } from 'react';

/**
 * Custom hook for frontend-triggered polling for Polymarket agent.
 *
 * This replaces POLY_CONTINUOUS_POLLING which blocks the backend with a long sleep.
 * Instead, the frontend triggers periodic 'cycle' commands, allowing other commands
 * (like updateApproval) to run immediately without waiting.
 *
 * @param enabled - Whether polling should be enabled (typically: agentId === 'agent-polymarket')
 * @param lifecycleState - The current lifecycle state of the agent ('running', 'stopped', etc.)
 * @param runCommand - Function to run a command on the agent
 * @param pollIntervalMs - Polling interval in milliseconds (default: 60000)
 */
export function usePolymarketPolling(
  enabled: boolean,
  lifecycleState: string | undefined,
  runCommand: (command: string) => void,
  pollIntervalMs: number = 60000,
): void {
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPollRef = useRef<number>(0);

  useEffect(() => {
    // Only enable polling when enabled and agent is running
    if (!enabled || lifecycleState !== 'running') {
      // Clear any existing interval when not running
      if (pollIntervalRef.current) {
        console.log('[usePolymarketPolling] Stopping poll cycle - agent not running');
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // Don't start if already running
    if (pollIntervalRef.current) {
      return;
    }

    console.log(`[usePolymarketPolling] Starting poll cycle (every ${pollIntervalMs / 1000}s)`);

    // Start polling
    pollIntervalRef.current = setInterval(() => {
      const now = Date.now();
      // Prevent rapid firing if there's lag
      if (now - lastPollRef.current < pollIntervalMs * 0.9) {
        console.log('[usePolymarketPolling] Skipping poll - too soon since last poll');
        return;
      }

      console.log(`[usePolymarketPolling] Poll tick - running cycle command`);
      lastPollRef.current = now;
      runCommand('cycle');
    }, pollIntervalMs);

    // Cleanup on unmount or when lifecycleState changes
    return () => {
      if (pollIntervalRef.current) {
        console.log('[usePolymarketPolling] Cleaning up poll interval');
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [enabled, lifecycleState, runCommand, pollIntervalMs]);
}
