type AgentCommandRouteBase = {
  agentId: string;
  threadId: string;
};

type AgentCommandRouteInput =
  | (AgentCommandRouteBase & {
      command: {
        name: string;
        input?: unknown;
      };
    })
  | (AgentCommandRouteBase & {
      resume: unknown;
    })
  | (AgentCommandRouteBase & {
      message: {
        id: string;
        content: string;
      };
    });

export type AgentCommandRouteResponse = {
  ok: boolean;
  error?: string;
  taskState?: string | null;
  statusMessage?: string | null;
  domainProjection?: Record<string, unknown> | null;
  messages?: import('@ag-ui/core').Message[];
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
