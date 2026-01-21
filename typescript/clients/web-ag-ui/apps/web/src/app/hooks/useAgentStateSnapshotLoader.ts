'use client';

import { useAgent } from '@copilotkit/react-core/v2';

type SnapshotResult<TState> = {
  threadId: string;
  state: TState;
  messages: unknown[];
};

/**
 * React hook that returns a loader for the latest saved agent state/messages.
 * - Wraps runtimeClient.loadAgentState
 * - Parses the JSON strings into real objects
 * - Returns null when the thread does not exist or has no state
 */
export function useAgentStateSnapshotLoader<TState>(agentName: string) {
  const { agent } = useAgent({ agentId: agentName });

  return async (threadId: string): Promise<SnapshotResult<TState> | null> => {
    if (!threadId) {
      return null;
    }

    if (agent.threadId !== threadId) {
      // eslint-disable-next-line react-hooks/immutability -- align agent thread with requested snapshot
      agent.threadId = threadId;
    }

    try {
      await agent.connectAgent();
    } catch {
      return null;
    }

    return {
      threadId: agent.threadId,
      state: agent.state as TState,
      messages: agent.messages,
    };
  };
}
