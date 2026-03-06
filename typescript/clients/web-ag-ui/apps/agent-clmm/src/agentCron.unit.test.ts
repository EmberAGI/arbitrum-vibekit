import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runGraphOnce } from './agent.js';

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('runGraphOnce cron state update payload', () => {
  beforeEach(() => {
    process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'] ??= `0x${'1'.repeat(64)}`;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('does not replay thread state into the cycle command update payload', async () => {
    const threadId = 'thread-1';
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    fetchMock.mockResolvedValueOnce(jsonResponse({ thread_id: threadId }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ thread_id: threadId }));

    let stateUpdateBody: Record<string, unknown> | undefined;
    fetchMock.mockImplementationOnce((_url: string | URL | globalThis.Request, init?: RequestInit) => {
      const requestBody = typeof init?.body === 'string' ? init.body : '{}';
      stateUpdateBody = JSON.parse(requestBody) as Record<string, unknown>;
      return jsonResponse({ checkpoint_id: 'cp-1' });
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ run_id: 'run-1', status: 'running' }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ run_id: 'run-1', status: 'success' }));

    await runGraphOnce(threadId);

    expect(stateUpdateBody).toBeDefined();
    expect(stateUpdateBody).toMatchObject({
      as_node: 'runCommand',
      values: {
        messages: [expect.objectContaining({ role: 'user' })],
      },
    });
    expect((stateUpdateBody?.['values'] as Record<string, unknown>) ?? {}).not.toHaveProperty('thread');

    const calledUrls = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes(`/threads/${threadId}/state`));
    expect(calledUrls).toEqual([`http://localhost:8124/threads/${threadId}/state`]);
  });
});
