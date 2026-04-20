import { concat, from, NEVER } from 'rxjs';
import { EventType } from '@ag-ui/core';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runMock = vi.fn();
const connectMock = vi.fn();

vi.mock('../copilotkit/piRuntimeHttpAgent', () => ({
  createAgentRuntimeHttpAgent: vi.fn(() => ({
    run: runMock,
    connect: connectMock,
  })),
}));

vi.mock('../copilotkit/copilotRuntimeRegistry', () => ({
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
    connectMock.mockReset();
  });

  it('rejects invalid payloads', async () => {
    const response = await POST(buildRequest({ agentId: 'agent-portfolio-manager' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid agent command payload.',
    });
  });

  it('rejects commands for agents removed from the production surface', async () => {
    const response = await POST(
      buildRequest({
        agentId: 'agent-pi-example',
        threadId: 'thread-1',
        command: {
          name: 'hydrate_runtime_projection',
        },
      }),
    );

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

  it('forwards resume payloads through the runtime route without wrapping them as named commands', async () => {
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
                    content: 'Onboarding resumed.',
                  },
                },
              },
            },
            projected: {
              workflow: {
                phase: 'active',
              },
            },
          },
        },
        { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-1' },
      ]),
    );

    const resumePayload = {
      walletAddress: '0x00000000000000000000000000000000000000a1',
      portfolioMandate: {
        approved: true,
        riskLevel: 'medium',
      },
    };

    const response = await POST(
      buildRequest({
        agentId: 'agent-portfolio-manager',
        threadId: 'thread-1',
        resume: resumePayload,
      }),
    );

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        forwardedProps: {
          command: {
            resume: resumePayload,
          },
        },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      taskState: 'completed',
      statusMessage: 'Onboarding resumed.',
      domainProjection: {
        workflow: {
          phase: 'active',
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

  it('treats thread.execution failure as an authoritative command failure', async () => {
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
              execution: {
                status: 'failed',
                statusMessage: 'Portfolio manager signing input is incomplete. Restart onboarding and try again.',
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
        resume: {
          outcome: 'signed',
          signedDelegations: [],
        },
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Portfolio manager signing input is incomplete. Restart onboarding and try again.',
    });
  });

  it('treats delta-only failed command runs as authoritative state updates', async () => {
    runMock.mockReturnValue(
      from([
        { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
        {
          type: EventType.STATE_DELTA,
          threadId: 'thread-1',
          runId: 'run-1',
          delta: [
            {
              op: 'replace',
              path: '/thread/task/taskStatus/state',
              value: 'failed',
            },
            {
              op: 'replace',
              path: '/thread/task/taskStatus/message',
              value: {
                content: 'Shared Ember could not admit any USDC for lending.',
              },
            },
          ],
        },
        { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-1' },
      ]),
    );
    connectMock.mockReturnValue(
      from([
        { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'connect-1' },
        {
          type: EventType.STATE_SNAPSHOT,
          threadId: 'thread-1',
          runId: 'connect-1',
          snapshot: {
            thread: {
              id: 'thread-1',
              task: {
                taskStatus: {
                  state: 'failed',
                  message: {
                    content: 'Shared Ember could not admit any USDC for lending.',
                  },
                },
              },
            },
            projected: {
              workflow: {
                phase: 'onboarding',
              },
            },
          },
        },
        { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'connect-1' },
      ]),
    );

    const response = await POST(
      buildRequest({
        agentId: 'agent-portfolio-manager',
        threadId: 'thread-1',
        resume: {
          approved: true,
        },
      }),
    );

    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        messages: [],
        state: {},
        tools: [],
        context: [],
      }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Shared Ember could not admit any USDC for lending.',
    });
  });

  it('uses the first authoritative connect snapshot when the fallback connect stream stays open', async () => {
    runMock.mockReturnValue(
      from([
        { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
        {
          type: EventType.STATE_DELTA,
          threadId: 'thread-1',
          runId: 'run-1',
          delta: [
            {
              op: 'replace',
              path: '/thread/task/taskStatus/state',
              value: 'completed',
            },
          ],
        },
        { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId: 'run-1' },
      ]),
    );
    connectMock.mockReturnValue(
      concat(
        from([
          { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'connect-1' },
          {
            type: EventType.STATE_SNAPSHOT,
            threadId: 'thread-1',
            runId: 'connect-1',
            snapshot: {
              thread: {
                id: 'thread-1',
                task: {
                  taskStatus: {
                    state: 'completed',
                    message: {
                      content: 'Lending runtime projection hydrated from Shared Ember Domain Service.',
                    },
                  },
                },
              },
              projected: {
                managedMandateEditor: {
                  mandateRef: 'mandate-ember-lending-001',
                },
              },
            },
          },
        ]),
        NEVER,
      ),
    );

    const result = await Promise.race([
      POST(
        buildRequest({
          agentId: 'agent-ember-lending',
          threadId: 'thread-1',
          command: {
            name: 'hydrate_runtime_projection',
          },
        }),
      ).then(async (response) => ({
        kind: 'response' as const,
        status: response.status,
        body: await response.json(),
      })),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        setTimeout(() => resolve({ kind: 'timeout' }), 100);
      }),
    ]);

    expect(result).toEqual({
      kind: 'response',
      status: 200,
      body: {
        ok: true,
        taskState: 'completed',
        statusMessage: 'Lending runtime projection hydrated from Shared Ember Domain Service.',
        domainProjection: {
          managedMandateEditor: {
            mandateRef: 'mandate-ember-lending-001',
          },
        },
      },
    });
  });
});
