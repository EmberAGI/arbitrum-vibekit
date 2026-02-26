import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getMethod(init?: unknown): string {
  if (typeof init !== 'object' || init === null) {
    return 'GET';
  }
  if (!('method' in init)) {
    return 'GET';
  }
  const method = (init as { method?: unknown }).method;
  return typeof method === 'string' ? method : 'GET';
}

function getUrl(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

describe('runGraphOnce busy handling integration (CLMM)', () => {
  beforeEach(() => {
    delete process.env['LANGGRAPH_DEPLOYMENT_URL'];
    delete process.env['LANGGRAPH_GRAPH_ID'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('normalizes stale onboarding input-required task state when projecting cycle command to thread state', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: unknown) => {
      const url = getUrl(input);
      const method = getMethod(init);

      if (url.endsWith('/threads') && method === 'POST') {
        return jsonResponse({ thread_id: 'thread-1' });
      }
      if (url.endsWith('/threads/thread-1') && method === 'PATCH') {
        return jsonResponse({ thread_id: 'thread-1' });
      }
      if (url.endsWith('/threads/thread-1/state') && method === 'GET') {
        return jsonResponse({
          values: {
            view: {
              command: 'hire',
              poolArtifact: {},
              operatorInput: {},
              fundingTokenInput: {},
              delegationsBypassActive: true,
              operatorConfig: {},
              onboardingFlow: {
                status: 'completed',
                revision: 5,
                steps: [
                  { id: 'pool-selection', title: 'Pool Selection', status: 'completed' },
                  { id: 'delegation-signing', title: 'Delegation Signing', status: 'completed' },
                ],
              },
              task: {
                id: 'task-1',
                taskStatus: {
                  state: 'input-required',
                  message: { content: 'Waiting for delegation approval to continue onboarding.' },
                },
              },
            },
          },
        });
      }
      if (url.endsWith('/threads/thread-1/state') && method === 'POST') {
        if (!init || typeof init !== 'object' || !('body' in init)) {
          throw new Error('Missing request body');
        }
        const bodyText = (init as { body?: unknown }).body;
        if (typeof bodyText !== 'string') {
          throw new Error('Expected string request body');
        }
        const body = JSON.parse(bodyText) as {
          values?: { view?: { task?: { taskStatus?: { state?: string } } } };
        };
        expect(body.values?.view?.task?.taskStatus?.state).toBe('working');
        return jsonResponse({ checkpoint_id: 'cp-1' });
      }
      if (url.endsWith('/threads/thread-1/runs') && method === 'POST') {
        return new Response('busy', { status: 422 });
      }
      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const { runGraphOnce } = await import('../src/agent.js');

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(runGraphOnce('thread-1')).resolves.toBeUndefined();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
