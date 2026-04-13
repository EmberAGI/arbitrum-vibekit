import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { type RunAgentInput, verifyEvents } from '@ag-ui/client';
import { EventType, type BaseEvent } from '@ag-ui/core';
import {
  createPiExampleGatewayService,
  PI_EXAMPLE_AGENT_ID,
  PI_EXAMPLE_AG_UI_BASE_PATH,
} from 'agent-pi-example/ag-ui-server';
import { lastValueFrom, toArray, type Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertSharedThreadSnapshotContract } from './sharedThreadSnapshotContract.test-support';
import { createAgentRuntimeHttpAgent } from './piRuntimeHttpAgent';

type RecordedRequest = {
  method: string;
  pathname: string;
  body: string;
};

type AgentRuntimeService = Awaited<
  ReturnType<typeof createPiExampleGatewayService>
>;
type StateDeltaEvent = Extract<BaseEvent, { type: EventType.STATE_DELTA }>;
type JsonPatchOperation = {
  op: string;
  path: string;
  value?: unknown;
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

function createResumeRunInput(resumePayload: unknown, overrides: Partial<RunAgentInput> = {}): RunAgentInput {
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

async function readFirstMatchingEventSource<T>(
  source: readonly T[] | AsyncIterable<T>,
  predicate: (event: T) => boolean,
) {
  if (Array.isArray(source)) {
    return source.find(predicate);
  }

  const iterator = source[Symbol.asyncIterator]();
  try {
    while (true) {
      const result = await iterator.next();
      if (result.done) {
        return undefined;
      }
      if (predicate(result.value)) {
        return result.value;
      }
    }
  } finally {
    await iterator.return?.();
  }
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

function findStateDeltas(events: BaseEvent[]) {
  return events.filter((event): event is StateDeltaEvent => event.type === EventType.STATE_DELTA);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function matchesArtifactData(
  value: unknown,
  expected: {
    type: string;
    status: string;
    command?: string;
  },
): boolean {
  if (!isRecord(value)) {
    return false;
  }

  if (isRecord(value.current) && matchesArtifactData(value.current, expected)) {
    return true;
  }

  if (!isRecord(value.data)) {
    return false;
  }

  if (value.data.type !== expected.type || value.data.status !== expected.status) {
    return false;
  }

  return expected.command === undefined || value.data.command === expected.command;
}

function matchesDispatchResponseWithA2Ui(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  if (Array.isArray(value.events)) {
    return value.events.some((event) => matchesDispatchResponseWithA2Ui(event));
  }

  if (value.type !== 'dispatch-response' || !Array.isArray(value.parts)) {
    return false;
  }

  return value.parts.some((part) => isRecord(part) && part.kind === 'a2ui');
}

function matchesArtifactActivity(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  if (Array.isArray(value.events)) {
    return value.events.some((event) => matchesArtifactActivity(event));
  }

  return value.type === 'artifact';
}

function matchesTaskStatusMessage(value: unknown, content: string): boolean {
  return value === content || (isRecord(value) && value.content === content);
}

function expectStateDeltaOperation(
  events: BaseEvent[],
  predicate: (operation: JsonPatchOperation) => boolean,
): void {
  const stateDeltas = findStateDeltas(events);
  expect(stateDeltas).not.toHaveLength(0);
  expect(
    stateDeltas.some((event) => event.delta.some((operation) => predicate(operation as JsonPatchOperation))),
  ).toBe(true);
}

function createInternalPostgresHooks() {
  return {
    ensureReady: vi.fn(async () => ({
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
    })),
    loadInspectionState: vi.fn(async () => ({
      threads: [],
      executions: [],
      automations: [],
      automationRuns: [],
      interrupts: [],
      leases: [],
      outboxIntents: [],
      executionEvents: [],
      threadActivities: [],
    })),
    executeStatements: vi.fn(async () => undefined),
    persistDirectExecution: vi.fn(async () => undefined),
  };
}

describe('agent-runtime HTTP agent integration', () => {
  let server: Server;
  let runtimeUrl: string;
  let requests: RecordedRequest[];
  let service: AgentRuntimeService;

  beforeEach(async () => {
    requests = [];

    service = await createPiExampleGatewayService({
      env: {
        OPENROUTER_API_KEY: 'test-openrouter-key',
        PI_AGENT_EXTERNAL_BOUNDARY_MODE: 'mocked',
      },
      __internalPostgres: createInternalPostgresHooks(),
    } as any);
    const handler = service.createAgUiHandler({
      agentId: PI_EXAMPLE_AGENT_ID,
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
    const agent = createAgentRuntimeHttpAgent({
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

  it('emits the shared web-facing lifecycle and task status snapshot contract on connect', async () => {
    const connectEventSource = await service.connect({ threadId: 'thread-1' });
    const connectSnapshot = await readFirstMatchingEventSource(
      connectEventSource,
      (event): event is BaseEvent => event.type === EventType.STATE_SNAPSHOT,
    );

    expect(connectSnapshot).toBeDefined();
    assertSharedThreadSnapshotContract((connectSnapshot as Extract<BaseEvent, { snapshot: unknown }>).snapshot);
  });

  it('emits live AG-UI tool lifecycle events and automation artifacts when the Pi loop schedules and runs automation', async () => {
    const agent = createAgentRuntimeHttpAgent({
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

    expectStateDeltaOperation(
      runEvents,
      (operation) => operation.path === '/thread/task/taskStatus/state' && operation.value === 'submitted',
    );
    expectStateDeltaOperation(
      runEvents,
      (operation) =>
        /^\/thread\/artifacts(?:\/|$)/.test(operation.path) &&
        matchesArtifactData(operation.value, {
          type: 'automation-status',
          status: 'scheduled',
          command: 'sync',
        }),
    );
    expectStateDeltaOperation(
      runEvents,
      (operation) =>
        /^\/thread\/activity(?:\/|$)/.test(operation.path) &&
        matchesDispatchResponseWithA2Ui(operation.value),
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
    expectStateDeltaOperation(
      automationCancelEvents,
      (operation) => operation.path === '/thread/task/taskStatus/state' && operation.value === 'completed',
    );
    expectStateDeltaOperation(
      automationCancelEvents,
      (operation) => operation.path === '/thread/artifacts/current/data/status' && operation.value === 'canceled',
    );
    expectStateDeltaOperation(
      automationCancelEvents,
      (operation) =>
        /^\/thread\/activity(?:\/|$)/.test(operation.path) &&
        matchesDispatchResponseWithA2Ui(operation.value),
    );
  });

  it('surfaces an interrupt A2UI payload and clears it after the operator replies on the same thread', async () => {
    const agent = createAgentRuntimeHttpAgent({
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
    expectStateDeltaOperation(
      interruptEvents,
      (operation) => operation.path === '/thread/task/taskStatus/state' && operation.value === 'input-required',
    );
    expectStateDeltaOperation(
      interruptEvents,
      (operation) =>
        /^\/thread\/activity(?:\/|$)/.test(operation.path) &&
        matchesDispatchResponseWithA2Ui(operation.value),
    );

    const resumedEvents = await collectEvents(
      agent
        .run(
          createResumeRunInput(
            {
              operatorNote: 'Use the safe automation window.',
            },
            { runId: 'run-resume' },
          ),
        )
        .pipe(verifyEvents()),
    );

    expectStateDeltaOperation(
      resumedEvents,
      (operation) => operation.path === '/thread/task/taskStatus/state' && operation.value === 'working',
    );
    expectStateDeltaOperation(
      resumedEvents,
      (operation) =>
        /^\/thread\/task\/taskStatus\/message(?:\/content)?$/.test(operation.path) &&
        matchesTaskStatusMessage(operation.value, 'Operator input received. Continuing the Pi loop.'),
    );
    expectStateDeltaOperation(
      resumedEvents,
      (operation) => operation.path === '/thread/artifacts/current/data/status' && operation.value === 'resolved',
    );
    expectStateDeltaOperation(
      resumedEvents,
      (operation) =>
        /^\/thread\/activity(?:\/|$)/.test(operation.path) &&
        matchesArtifactActivity(operation.value),
    );
  });
});
