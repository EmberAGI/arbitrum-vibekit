import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPiExampleAgUiHandler, createPiExampleGatewayService, PI_EXAMPLE_AGENT_ID } from './agUiServer.js';

type AgUiEventEnvelope = {
  type: string;
  [key: string]: unknown;
};

type JsonPatchOperation = {
  op: string;
  path: string;
  value?: unknown;
};

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

function parseEventStreamBody(body: string): AgUiEventEnvelope[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)) as AgUiEventEnvelope);
}

function findStateSnapshot(events: readonly AgUiEventEnvelope[]) {
  return [...events].reverse().find((event) => event.type === 'STATE_SNAPSHOT');
}

function findStateDeltas(events: readonly AgUiEventEnvelope[]) {
  return events.filter(
    (event): event is AgUiEventEnvelope & { delta: JsonPatchOperation[] } =>
      event.type === 'STATE_DELTA' && Array.isArray(event.delta),
  );
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function decodeJsonPointerToken(token: string): string {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function applyJsonPatchOperation(target: unknown, operation: JsonPatchOperation): unknown {
  const tokens = operation.path
    .split('/')
    .slice(1)
    .map((token) => decodeJsonPointerToken(token));

  if (tokens.length === 0) {
    return operation.value;
  }

  let cursor = target as Record<string, unknown> | unknown[];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index]!;
    const nextToken = tokens[index + 1]!;
    const nextContainer = Number.isInteger(Number(nextToken)) ? [] : {};

    if (Array.isArray(cursor)) {
      const slot = Number(token);
      cursor[slot] ??= nextContainer;
      cursor = cursor[slot] as Record<string, unknown> | unknown[];
      continue;
    }

    const objectCursor = cursor as Record<string, unknown>;
    objectCursor[token] ??= nextContainer;
    cursor = objectCursor[token] as Record<string, unknown> | unknown[];
  }

  const finalToken = tokens.at(-1)!;
  if (Array.isArray(cursor)) {
    const slot = finalToken === '-' ? cursor.length : Number(finalToken);
    if (operation.op === 'remove') {
      cursor.splice(slot, 1);
      return target;
    }

    cursor[slot] = operation.value;
    return target;
  }

  const objectCursor = cursor as Record<string, unknown>;
  if (operation.op === 'remove') {
    delete objectCursor[finalToken];
    return target;
  }

  objectCursor[finalToken] = operation.value;
  return target;
}

function projectStateSnapshot(input: {
  baseline?: AgUiEventEnvelope;
  events: readonly AgUiEventEnvelope[];
}) {
  const projectedSnapshot = cloneJson(
    (input.baseline && 'snapshot' in input.baseline ? input.baseline.snapshot : { thread: {} }) as Record<
      string,
      unknown
    >,
  );

  for (const event of findStateDeltas(input.events)) {
    for (const operation of event.delta) {
      applyJsonPatchOperation(projectedSnapshot, operation);
    }
  }

  return {
    type: 'STATE_SNAPSHOT',
    snapshot: projectedSnapshot,
  } satisfies AgUiEventEnvelope;
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

describe('agent-pi-example AG-UI integration', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const service = await createPiExampleGatewayService({
      env: {
        OPENROUTER_API_KEY: 'test-openrouter-key',
        PI_AGENT_EXTERNAL_BOUNDARY_MODE: 'mocked',
      },
      __internalPostgres: createInternalPostgresHooks(),
    } as any);

    const handler = createPiExampleAgUiHandler({
      agentId: PI_EXAMPLE_AGENT_ID,
      service,
    });

    server = createServer((request, response) => {
      void (async () => {
        const body = await readRequestBody(request);
        const origin = `http://${request.headers.host ?? '127.0.0.1'}`;
        const url = new URL(request.url ?? '/', origin);

        const webRequest = new Request(url, {
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
    baseUrl = `http://127.0.0.1:${address.port}/ag-ui`;
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

  it('serves the full runtime-owned lifecycle over real AG-UI HTTP endpoints', async () => {
    const runResponse = await fetch(`${baseUrl}/agent/${PI_EXAMPLE_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-1',
        runId: 'run-hire',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'Please hire the agent and start onboarding.',
          },
        ],
      }),
    });

    expect(runResponse.ok).toBe(true);
    expect(runResponse.headers.get('content-type')).toContain('text/event-stream');
    const runEvents = parseEventStreamBody(await runResponse.text());
    const runSnapshot = findStateSnapshot(runEvents) ?? projectStateSnapshot({ events: runEvents });

    expect(runSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'onboarding',
            onboardingStep: 'operator-profile',
          },
          task: {
            taskStatus: {
              state: 'input-required',
              message: {
                content: 'Please provide a short operator note to continue onboarding.',
              },
            },
          },
        },
      },
    });

    const resumeResponse = await fetch(`${baseUrl}/agent/${PI_EXAMPLE_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-1',
        runId: 'run-resume',
        forwardedProps: {
          command: {
            resume: '{"operatorNote":"safe window approved"}',
          },
        },
      }),
    });

    expect(resumeResponse.ok).toBe(true);
    const resumeEvents = parseEventStreamBody(await resumeResponse.text());
    const resumeSnapshot =
      findStateSnapshot(resumeEvents) ??
      projectStateSnapshot({ baseline: runSnapshot, events: resumeEvents });

    expect(resumeSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'onboarding',
            onboardingStep: 'delegation-note',
            operatorNote: 'safe window approved',
          },
          task: {
            taskStatus: {
              state: 'working',
              message: {
                content: 'Operator note captured. Ready to complete onboarding.',
              },
            },
          },
          artifacts: {
            current: {
              data: {
                type: 'lifecycle-status',
                onboardingStep: 'delegation-note',
                operatorNote: 'safe window approved',
              },
            },
          },
        },
      },
    });

    const completeResponse = await fetch(`${baseUrl}/agent/${PI_EXAMPLE_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-1',
        runId: 'run-complete',
        forwardedProps: {
          command: {
            name: 'complete_onboarding',
          },
        },
      }),
    });

    expect(completeResponse.ok).toBe(true);
    const completeEvents = parseEventStreamBody(await completeResponse.text());
    const completeSnapshot =
      findStateSnapshot(completeEvents) ??
      projectStateSnapshot({ baseline: resumeSnapshot, events: completeEvents });

    expect(completeSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'hired',
            operatorNote: 'safe window approved',
          },
          task: {
            taskStatus: {
              state: 'completed',
              message: {
                content: 'Onboarding complete. Agent is now hired.',
              },
            },
          },
          artifacts: {
            current: {
              data: {
                type: 'lifecycle-status',
                phase: 'hired',
                operatorNote: 'safe window approved',
              },
            },
          },
        },
      },
    });

    const fireResponse = await fetch(`${baseUrl}/agent/${PI_EXAMPLE_AGENT_ID}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'thread-1',
        runId: 'run-fire',
        forwardedProps: {
          command: {
            name: 'fire',
          },
        },
      }),
    });

    expect(fireResponse.ok).toBe(true);
    const fireEvents = parseEventStreamBody(await fireResponse.text());
    const fireSnapshot =
      findStateSnapshot(fireEvents) ??
      projectStateSnapshot({ baseline: completeSnapshot, events: fireEvents });

    expect(fireSnapshot).toMatchObject({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        thread: {
          lifecycle: {
            phase: 'fired',
            operatorNote: 'safe window approved',
          },
          task: {
            taskStatus: {
              state: 'completed',
              message: {
                content: 'Agent moved to fired. Rehire is still available in this thread.',
              },
            },
          },
          artifacts: {
            current: {
              data: {
                type: 'lifecycle-status',
                phase: 'fired',
                operatorNote: 'safe window approved',
              },
            },
          },
        },
      },
    });
  });
});
