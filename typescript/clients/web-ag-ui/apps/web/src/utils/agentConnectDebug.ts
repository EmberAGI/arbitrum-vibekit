'use client';

type AgentConnectDebugPayload = {
  event: string;
  agentId?: string;
  threadId?: string | null;
  payload?: Record<string, unknown>;
};

const isEnabled = () => process.env.NEXT_PUBLIC_AGENT_CONNECT_DEBUG === 'true';

export function emitAgentConnectDebug(input: AgentConnectDebugPayload): void {
  if (!isEnabled()) {
    return;
  }

  const body = JSON.stringify({
    ts: new Date().toISOString(),
    event: input.event,
    agentId: input.agentId ?? null,
    threadId: input.threadId ?? null,
    path: typeof window === 'undefined' ? undefined : window.location.pathname,
    visibilityState: typeof document === 'undefined' ? undefined : document.visibilityState,
    hasFocus: typeof document === 'undefined' ? undefined : document.hasFocus(),
    payload: input.payload,
  });

  console.debug('[agent-connect-debug:client]', JSON.parse(body));

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon('/api/agent-connect-debug', blob);
    return;
  }

  void fetch('/api/agent-connect-debug', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body,
    keepalive: true,
  }).catch(() => {
    // best-effort debug transport only
  });
}
