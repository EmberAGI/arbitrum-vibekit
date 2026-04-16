import { from } from 'rxjs';
import { EventType } from '@ag-ui/core';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runMock = vi.fn();

vi.mock('../copilotkit/piRuntimeHttpAgent', () => ({
  createAgentRuntimeHttpAgent: vi.fn(() => ({
    run: runMock,
  })),
}));

vi.mock('../copilotkit/copilotRuntimeRegistry', () => ({
  PI_EXAMPLE_AGENT_NAME: 'agent-pi-example',
  PORTFOLIO_MANAGER_AGENT_NAME: 'agent-portfolio-manager',
  EMBER_LENDING_AGENT_NAME: 'agent-ember-lending',
  resolveAgentRuntimeUrl: vi.fn(() => 'http://127.0.0.1:3420/ag-ui'),
}));

import { POST } from './route';

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/agent-command', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
  });
}

describe('POST /api/agent-command', () => {
  beforeEach(() => {
    runMock.mockReset();
  });

  it('rejects invalid payloads', async () => {
    const response = await POST(buildRequest({ agentId: 'agent-portfolio-manager' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid agent command payload.',
    });
  });

  it('returns the latest thread domain projection after a successful one-off command run', async () => {
    runMock.mockReturnValue(
      from([
        { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
        {
          type: EventType.STATE_SNAPSHOT,
          threadId: 'thread-1',
          runId: 'run-1',
          snapshot: {
            thread: {
              id: 'thread-1',
              task: {
                taskStatus: {
                  state: 'completed',
                  message: {
                    content: 'Managed mandate updated.',
                  },
                },
              },
            },
            projected: {
              managedMandateEditor: {
              },
            },
          },
        },
        { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-1' },
      ]),
    );

    const response = await POST(
      buildRequest({
        agentId: 'agent-portfolio-manager',
        threadId: 'thread-1',
        command: {
          name: 'update_managed_mandate',
          input: {
            targetAgentId: 'ember-lending',
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      taskState: 'completed',
      statusMessage: 'Managed mandate updated.',
      domainProjection: {
        managedMandateEditor: {
        },
      },
    });
  });

  it('does not treat legacy thread.domainProjection as a supported runtime response shape', async () => {
    runMock.mockReturnValue(
      from([
        { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
        {
          type: EventType.STATE_SNAPSHOT,
          threadId: 'thread-1',
          runId: 'run-1',
          snapshot: {
            thread: {
              id: 'thread-1',
              task: {
                taskStatus: {
                  state: 'completed',
                },
              },
              domainProjection: {
                managedMandateEditor: {
                },
              },
            },
          },
        },
        { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-1' },
      ]),
    );

    const response = await POST(
      buildRequest({
        agentId: 'agent-portfolio-manager',
        threadId: 'thread-1',
        command: {
          name: 'hydrate_runtime_projection',
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      taskState: 'completed',
      statusMessage: null,
      domainProjection: null,
    });
  });

  it('returns the runtime failure message when the one-off command fails', async () => {
    runMock.mockReturnValue(
      from([
        { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
        {
          type: EventType.STATE_SNAPSHOT,
          threadId: 'thread-1',
          runId: 'run-1',
          snapshot: {
            thread: {
              id: 'thread-1',
              task: {
                taskStatus: {
                  state: 'failed',
                  message: {
                    content: 'Managed mandate updates require a live Shared Ember projection.',
                  },
                },
              },
            },
          },
        },
        { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-1' },
      ]),
    );

    const response = await POST(
      buildRequest({
        agentId: 'agent-portfolio-manager',
        threadId: 'thread-1',
        command: {
          name: 'update_managed_mandate',
        },
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Managed mandate updates require a live Shared Ember projection.',
    });
  });
});
