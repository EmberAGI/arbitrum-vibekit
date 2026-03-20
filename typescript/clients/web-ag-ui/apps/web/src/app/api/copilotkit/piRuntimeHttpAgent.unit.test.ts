import type { BaseEvent, RunAgentInput } from '@ag-ui/client';
import { lastValueFrom, toArray } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PiRuntimeHttpAgent } from './piRuntimeHttpAgent';

function createInput(overrides: Partial<RunAgentInput> = {}): RunAgentInput {
  return {
    threadId: 'thread-1',
    runId: 'run-1',
    messages: [],
    state: {},
    tools: [],
    context: [],
    forwardedProps: {},
    ...overrides,
  };
}

function createSseResponse(events: BaseEvent[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream',
    },
  });
}

async function collectEvents(source$: { pipe: typeof import('rxjs').Observable.prototype.pipe }) {
  return lastValueFrom(source$.pipe(toArray()));
}

describe('PiRuntimeHttpAgent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('connects to the Pi AG-UI connect endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      createSseResponse([
        {
          type: 'RUN_STARTED',
          threadId: 'thread-1',
          runId: 'run-1',
        } as BaseEvent,
        {
          type: 'RUN_FINISHED',
          threadId: 'thread-1',
          runId: 'run-1',
          result: { status: 'completed' },
        } as BaseEvent,
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const agent = new PiRuntimeHttpAgent({
      agentId: 'agent-pi-example',
      runtimeUrl: 'http://pi-agent-example:3410/ag-ui',
    });

    const events = await collectEvents(agent.connect(createInput()));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://pi-agent-example:3410/ag-ui/agent/agent-pi-example/connect',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(createInput()),
      }),
    );
    expect(events.map((event) => event.type)).toEqual(['RUN_STARTED', 'RUN_FINISHED']);
  });

  it('posts stop to the Pi AG-UI endpoint with the active thread and run ids', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createSseResponse([
          {
            type: 'RUN_FINISHED',
            threadId: 'thread-9',
            runId: 'run-9',
            result: { status: 'completed' },
          } as BaseEvent,
        ]),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    const agent = new PiRuntimeHttpAgent({
      agentId: 'agent-pi-example',
      runtimeUrl: 'http://pi-agent-example:3410/ag-ui',
    });

    await collectEvents(
      agent.run(
        createInput({
          threadId: 'thread-9',
          runId: 'run-9',
        }),
      ),
    );
    agent.abortRun();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://pi-agent-example:3410/ag-ui/agent/agent-pi-example/stop',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          threadId: 'thread-9',
          runId: 'run-9',
        }),
      }),
    );
  });
});
