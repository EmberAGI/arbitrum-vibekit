import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

import { type RunAgentInput, verifyEvents } from '@ag-ui/client';
import { type PiRuntimeGatewayService } from 'agent-runtime';
import { createPiRuntimeGatewayAgUiHandler, PiRuntimeGatewayHttpAgent } from 'agent-runtime/pi-transport';
import { filter, firstValueFrom, lastValueFrom, toArray } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createPiExampleGatewayService,
  PI_EXAMPLE_AGENT_ID,
  PI_EXAMPLE_AG_UI_BASE_PATH,
} from 'agent-pi-example/ag-ui-server';

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

async function collectEvents(source$: { pipe: typeof import('rxjs').Observable.prototype.pipe }) {
  return lastValueFrom(source$.pipe(toArray()));
}

async function waitForEvent<T extends { type?: string }>(
  source$: { pipe: typeof import('rxjs').Observable.prototype.pipe },
  type: string,
) {
  return firstValueFrom(source$.pipe(filter((event: T) => event.type === type)));
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

    server = createServer(async (request, response) => {
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

  it('talks to the live Pi example app over AG-UI connect, run, and stop endpoints', async () => {
    const agent = new PiRuntimeGatewayHttpAgent({
      agentId: PI_EXAMPLE_AGENT_ID,
      runtimeUrl,
    });

    const connectEvents = await collectEvents(agent.connect(createInput()).pipe(verifyEvents()));
    const runInput = createRunInput();
    const runEvents = await collectEvents(agent.run(runInput));
    agent.abortRun();

    expect(connectEvents).toContainEqual(
      expect.objectContaining({
        type: 'RUN_STARTED',
        threadId: 'thread-1',
        runId: 'run-1',
      }),
    );
    expect(connectEvents).toContainEqual(
      expect.objectContaining({
        type: 'STATE_SNAPSHOT',
        snapshot: expect.objectContaining({
          thread: expect.objectContaining({
            id: 'thread-1',
          }),
        }),
      }),
    );
    expect(connectEvents).toContainEqual(
      expect.objectContaining({
        type: 'RUN_FINISHED',
        threadId: 'thread-1',
        runId: 'run-1',
      }),
    );
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
    await waitForAssertion(() => {
      expect(requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'POST',
            pathname: `${PI_EXAMPLE_AG_UI_BASE_PATH}/agent/${PI_EXAMPLE_AGENT_ID}/connect`,
            body: JSON.stringify(createInput()),
          }),
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
});
