type AgentCommandRouteInput = {
  agentId: string;
  threadId: string;
  command: {
    name: string;
    input?: unknown;
  };
};

type AgentCommandRouteResponse = {
  ok: boolean;
  error?: string;
  taskState?: string | null;
  statusMessage?: string | null;
  domainProjection?: Record<string, unknown> | null;
};

function readErrorMessage(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'string' &&
    value.error.trim().length > 0
  ) {
    return value.error;
  }

  return 'Agent command failed.';
}

export async function invokeAgentCommandRoute(
  input: AgentCommandRouteInput,
): Promise<AgentCommandRouteResponse> {
  const response = await fetch('/api/agent-command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as AgentCommandRouteResponse | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(readErrorMessage(payload));
  }

  return payload;
}
