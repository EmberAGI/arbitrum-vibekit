import { useCopilotContext } from '@copilotkit/react-core';
import { parseJson } from '@copilotkit/shared';

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
  const { runtimeClient } = useCopilotContext();

  return async (threadId: string): Promise<SnapshotResult<TState> | null> => {
    const { data } = await runtimeClient.loadAgentState({ threadId, agentName });
    const payload = data?.loadAgentState;

    if (!payload?.threadExists || !payload.state) {
      return null;
    }

    return {
      threadId: payload.threadId,
      state: parseJson(payload.state, {}) as TState,
      messages: parseJson(payload.messages, []),
    };
  };
}
