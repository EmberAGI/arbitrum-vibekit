import type { v7 as uuidv7 } from 'uuid';

type AgentLike = {
  addMessage: (message: { id: string; role: 'user'; content: string }) => void;
  abortRun?: () => void;
  detachActiveRun?: () => Promise<void> | void;
};

type CopilotkitLike<TRunAgentParams extends { agent: unknown }> = {
  // CopilotKit v2 runAgent params are stricter than we want to depend on here.
  // Infer the concrete params type from the passed copilotkit instance.
  runAgent: (params: TRunAgentParams) => Promise<unknown>;
};

type BoolRef = { current: boolean };

export async function fireAgentRun<TRunAgentParams extends { agent: unknown }>(params: {
  agent: (TRunAgentParams['agent'] & AgentLike) | null;
  copilotkit: CopilotkitLike<TRunAgentParams>;
  threadId: string | undefined;
  runInFlightRef: BoolRef;
  createId: typeof uuidv7;
}): Promise<boolean> {
  const { agent, threadId, runInFlightRef } = params;
  if (!agent || !threadId) return false;

  // If an onboarding run is currently blocked at an interrupt, the hook-level guard
  // prevents new commands. `fire` is special: it must always work as an escape hatch.
  if (runInFlightRef.current) {
    try {
      agent.abortRun?.();
    } finally {
      await Promise.resolve(agent.detachActiveRun?.()).catch(() => {
        // best-effort; ignore
      });
    }
  }

  // Keep `runInFlightRef` true: we are immediately starting a new run.
  runInFlightRef.current = true;

  agent.addMessage({
    id: params.createId(),
    role: 'user',
    content: JSON.stringify({ command: 'fire' }),
  });

  // Fire-and-forget: UI state updates will flow in via the AG-UI stream / sync poller.
  void params.copilotkit.runAgent({ agent } as TRunAgentParams).catch(() => {
    // Errors are surfaced via CopilotKit / agent subscribers.
  });

  return true;
}

