import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

type ConnectAbortHandler = () => void;
type ConnectAbortersByThread = Map<string, Set<ConnectAbortHandler>>;

type RuntimeGlobals = typeof globalThis & {
  __copilotkitConnectAbortersByThread?: ConnectAbortersByThread;
};

function getRuntimeGlobals(): RuntimeGlobals {
  return globalThis as RuntimeGlobals;
}

describe('/api/agent-disconnect', () => {
  beforeEach(() => {
    getRuntimeGlobals().__copilotkitConnectAbortersByThread = new Map();
  });

  it('aborts active connect handlers for the agent/thread key', async () => {
    const abortA = vi.fn();
    const abortB = vi.fn();
    getRuntimeGlobals().__copilotkitConnectAbortersByThread?.set(
      'agent-gmx-allora:thread-1',
      new Set([abortA, abortB]),
    );

    const request = new Request('http://localhost/api/agent-disconnect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-gmx-allora',
        threadId: 'thread-1',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      abortedCount: 2,
    });
    expect(abortA).toHaveBeenCalledTimes(1);
    expect(abortB).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for invalid payloads', async () => {
    const request = new Request('http://localhost/api/agent-disconnect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: '',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Invalid disconnect payload',
    });
  });
});
