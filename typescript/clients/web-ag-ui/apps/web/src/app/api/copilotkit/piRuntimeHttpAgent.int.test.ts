import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { type RunAgentInput, verifyEvents } from '@ag-ui/client';
import { EventType, type BaseEvent } from '@ag-ui/core';
import {
  createPiExampleGatewayService,
  PI_EXAMPLE_AGENT_ID,
  PI_EXAMPLE_AG_UI_BASE_PATH,
} from 'agent-pi-example/ag-ui-server';
import {
  createPiRuntimeGatewayAgUiHandler,
  PiRuntimeGatewayHttpAgent,
  type PiRuntimeGatewayService,
} from 'agent-runtime';
import { lastValueFrom, toArray, type Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

type RecordedRequest = {
  method: string;
  pathname: string;
  body: string;
};

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

function createRunInput(overrides: Partial<RunAgentInput> = {}): RunAgentInput {
  return createInput({
    messages: [
      {
        id: 'message-1',
        role: 'user',
        content: 'Say hello from the Pi example integration test.',
      },
    ],
    ...overrides,
  });
}

function createPromptRunInput(prompt: string, overrides: Partial<RunAgentInput> = {}): RunAgentInput {
  return createInput({
    messages: [
      {
        id: 'message-1',
        role: 'user',
        content: prompt,
      },
    ],
    ...overrides,
  });
}

function createResumeRunInput(resumePayload: string, overrides: Partial<RunAgentInput> = {}): RunAgentInput {
  return createInput({
    forwardedProps: {
      command: {
        resume: resumePayload,
      },
    },
    ...overrides,
  });
}

async function collectEvents<T>(source$: Observable<T>) {
  return lastValueFrom(source$.pipe(toArray()));
}

async function waitForAssertion(assertion: () => void, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

async function readRequestBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function writeNodeResponse(response: Response, target: ServerResponse): Promise<void> {
  target.statusCode = response.status;

  response.headers.forEach((value, key) => {
    target.setHeader(key, value);
  });

  const body = new Uint8Array(await response.arrayBuffer());
  target.end(body);
}

function findStateSnapshot(events: BaseEvent[]) {
  return [...events].reverse().find((event) => event.type === EventType.STATE_SNAPSHOT);
}

describe('PiRuntimeGatewayHttpAgent integration', () => {
  let server: Server;
  let runtimeUrl: string;
  let requests: RecordedRequest[];

  beforeEach(async () => {
    requests = [];

    const service: PiRuntimeGatewayService = createPiExampleGatewayService({
      env: {
        OPENROUTER_API_KEY: 'test-openrouter-key',
        PI_AGENT_EXTERNAL_BOUNDARY_MODE: 'mocked',
      },
      persistence: {
        ensureReady: async () => undefined,
        persistDirectExecution: async () => undefined,
        scheduleAutomation: async () => ({
          automationId: 'automation-1',
          runId: 'run-1',
          executionId: 'exec-1',
          artifactId: 'artifact-1',
          title: 'Sync every 5 minutes',
          schedule: { kind: 'every', intervalMinutes: 5 },
          nextRunAt: '2026-03-20T00:05:00.000Z',
        }),
        cancelAutomation: async () => ({
          automationId: 'automation-1',
          artifactId: 'artifact-1',
          title: 'Sync every 5 minutes',
          instruction: 'sync',
          schedule: { kind: 'every', intervalMinutes: 5 },
        }),
        requestInterrupt: async () => ({
          artifactId: 'interrupt-artifact-1',
        }),
        loadInspectionState: async () => ({
          threads: [],
          executions: [],
          automations: [],
          automationRuns: [],
          interrupts: [],
          leases: [],
          outboxIntents: [],
          executionEvents: [],
          threadActivities: [],
        }),
      },
    });
    const handler = createPiRuntimeGatewayAgUiHandler({
      agentId: PI_EXAMPLE_AGENT_ID,
      service,
      basePath: PI_EXAMPLE_AG_UI_BASE_PATH,
    });

    server = createServer((request, response) => {
      void (async () => {
        const body = await readRequestBody(request);
        const baseUrl = `http://${request.headers.host ?? '127.0.0.1'}`;
        const pathname = new URL(request.url ?? '/', baseUrl).pathname;

        requests.push({
          method: request.method ?? 'GET',
          pathname,
          body: body.toString('utf8'),
        });

        const webRequest = new Request(new URL(request.url ?? '/', baseUrl), {
          method: request.method,
          headers: new Headers(
            Object.entries(request.headers).flatMap(([name, value]) => {
              if (Array.isArray(value)) {
                return value.map((entry) => [name, entry] as const);
              }

              return value ? [[name, value] as const] : [];
            }),
          ),
          body: body.length > 0 ? body : undefined,
          duplex: 'half',
        });
        const webResponse = await handler(webRequest);
        await writeNodeResponse(webResponse, response);
      })().catch((error: unknown) => {
        response.statusCode = 500;
        response.end(error instanceof Error ? error.message : 'unknown error');
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    const address = server.address() as AddressInfo;
    runtimeUrl = `http://127.0.0.1:${address.port}${PI_EXAMPLE_AG_UI_BASE_PATH}`;
  });

  afterEach(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it('talks to the live Pi example app over AG-UI run and stop endpoints', async () => {
    const agent = new PiRuntimeGatewayHttpAgent({
      agentId: PI_EXAMPLE_AGENT_ID,
      runtimeUrl,
    });

    const runInput = createRunInput();
    const runEvents = await collectEvents(agent.run(runInput).pipe(verifyEvents()));
    agent.abortRun();

    expect(runEvents).toContainEqual(
      expect.objectContaining({
        type: 'RUN_STARTED',
        threadId: 'thread-1',
        runId: 'run-1',
      }),
    );
    expect(runEvents).toContainEqual(
      expect.objectContaining({
        type: 'RUN_FINISHED',
        threadId: 'thread-1',
        runId: 'run-1',
      }),
    );
    expect(runEvents).toContainEqual(
      expect.objectContaining({
        type: EventType.REASONING_START,
      }),
    );
    expect(runEvents).toContainEqual(
      expect.objectContaining({
        type: EventType.REASONING_MESSAGE_START,
        role: 'reasoning',
      }),
    );
    expect(
      runEvents.filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT),
    ).toHaveLength(2);
    await waitForAssertion(() => {
      expect(requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'POST',
            pathname: `${PI_EXAMPLE_AG_UI_BASE_PATH}/agent/${PI_EXAMPLE_AGENT_ID}/run`,
            body: JSON.stringify(runInput),
          }),
          expect.objectContaining({
            method: 'POST',
            pathname: `${PI_EXAMPLE_AG_UI_BASE_PATH}/agent/${PI_EXAMPLE_AGENT_ID}/stop`,
            body: JSON.stringify({
              threadId: 'thread-1',
              runId: 'run-1',
            }),
          }),
        ]),
      );
    });
  });

  it('emits live AG-UI tool lifecycle events and automation artifacts when the Pi loop schedules and runs automation', async () => {
    const agent = new PiRuntimeGatewayHttpAgent({
      agentId: PI_EXAMPLE_AGENT_ID,
      runtimeUrl,
    });

    const runEvents = await collectEvents(
      agent
        .run(createPromptRunInput('Please schedule sync automation.', { runId: 'run-schedule' }))
        .pipe(verifyEvents()),
    );

    expect(runEvents).toContainEqual(
      expect.objectContaining({
        type: EventType.TOOL_CALL_START,
        toolCallName: 'automation_schedule',
      }),
    );
    expect(runEvents).toContainEqual(
      expect.objectContaining({
        type: EventType.TOOL_CALL_END,
        toolCallId: 'pi-example-tool-schedule',
      }),
    );
    expect(
      runEvents.filter((event) => event.type === EventType.TOOL_CALL_ARGS),
    ).not.toHaveLength(0);

    expect(findStateSnapshot(runEvents)).toEqual(
      expect.objectContaining({
        type: EventType.STATE_SNAPSHOT,
        snapshot: expect.objectContaining({
          thread: expect.objectContaining({
            task: expect.objectContaining({
              taskStatus: expect.objectContaining({
                state: 'submitted',
              }),
            }),
            artifacts: expect.objectContaining({
              current: expect.objectContaining({
                data: expect.objectContaining({
                  type: 'automation-status',
                  status: 'scheduled',
                  command: 'sync',
                }),
              }),
            }),
            activity: expect.objectContaining({
              events: expect.arrayContaining([
                expect.objectContaining({
                  type: 'dispatch-response',
                  parts: expect.arrayContaining([
                    expect.objectContaining({
                      kind: 'a2ui',
                    }),
                  ]),
                }),
              ]),
            }),
          }),
        }),
      }),
    );

    const automationCancelEvents = await collectEvents(
      agent
        .run(
          createPromptRunInput('Please cancel the scheduled automation.', {
            runId: 'run-automation-cancel',
          }),
        )
        .pipe(verifyEvents()),
    );

    expect(automationCancelEvents).toContainEqual(
      expect.objectContaining({
        type: EventType.TOOL_CALL_START,
        toolCallName: 'automation_cancel',
      }),
    );
    expect(findStateSnapshot(automationCancelEvents)).toEqual(
      expect.objectContaining({
        type: EventType.STATE_SNAPSHOT,
        snapshot: expect.objectContaining({
          thread: expect.objectContaining({
            task: expect.objectContaining({
              taskStatus: expect.objectContaining({
                state: 'completed',
              }),
            }),
            artifacts: expect.objectContaining({
              current: expect.objectContaining({
                data: expect.objectContaining({
                  type: 'automation-status',
                  status: 'canceled',
                  command: 'sync',
                }),
              }),
            }),
            activity: expect.objectContaining({
              events: expect.arrayContaining([
                expect.objectContaining({
                  type: 'dispatch-response',
                  parts: expect.arrayContaining([
                    expect.objectContaining({
                      kind: 'a2ui',
                    }),
                  ]),
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it('surfaces an interrupt A2UI payload and clears it after the operator replies on the same thread', async () => {
    const agent = new PiRuntimeGatewayHttpAgent({
      agentId: PI_EXAMPLE_AGENT_ID,
      runtimeUrl,
    });

    const interruptEvents = await collectEvents(
      agent
        .run(
          createPromptRunInput('Please request operator input.', {
            runId: 'run-interrupt',
          }),
        )
        .pipe(verifyEvents()),
    );

    expect(interruptEvents).toContainEqual(
      expect.objectContaining({
        type: EventType.TOOL_CALL_START,
        toolCallName: 'request_operator_input',
      }),
    );
    expect(findStateSnapshot(interruptEvents)).toEqual(
      expect.objectContaining({
        type: EventType.STATE_SNAPSHOT,
        snapshot: expect.objectContaining({
          thread: expect.objectContaining({
            task: expect.objectContaining({
              taskStatus: expect.objectContaining({
                state: 'input-required',
              }),
            }),
            activity: expect.objectContaining({
              events: expect.arrayContaining([
                expect.objectContaining({
                  type: 'dispatch-response',
                  parts: expect.arrayContaining([
                    expect.objectContaining({
                      kind: 'a2ui',
                    }),
                  ]),
                }),
              ]),
            }),
          }),
        }),
      }),
    );

    const resumedEvents = await collectEvents(
      agent
        .run(createResumeRunInput('{"operatorNote":"Use the safe automation window."}', { runId: 'run-resume' }))
        .pipe(verifyEvents()),
    );

    expect(findStateSnapshot(resumedEvents)).toEqual(
      expect.objectContaining({
        type: EventType.STATE_SNAPSHOT,
        snapshot: expect.objectContaining({
          thread: expect.objectContaining({
            task: expect.objectContaining({
              taskStatus: expect.objectContaining({
                state: 'working',
                message: 'Operator input received. Continuing the Pi loop.',
              }),
            }),
            artifacts: expect.objectContaining({
              current: expect.objectContaining({
                data: expect.objectContaining({
                  type: 'interrupt-status',
                  status: 'resolved',
                }),
              }),
            }),
          }),
        }),
      }),
    );
    expect(findStateSnapshot(resumedEvents)).toEqual(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          thread: expect.objectContaining({
            activity: expect.objectContaining({
              events: expect.arrayContaining([
                expect.objectContaining({
                  type: 'artifact',
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });
});
