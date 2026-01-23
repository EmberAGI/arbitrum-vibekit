import { EventType, type BaseEvent } from '@ag-ui/client';
import { Client, type Message } from '@langchain/langgraph-sdk';
import { NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

const GRAPH_ID = 'agent-clmm';

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`${key} is required to run CLMM connect e2e tests.`);
  }
  return value.trim();
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string) => {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

type CollectOptions = {
  expectedTypes?: Set<string>;
  stopWhen?: (events: BaseEvent[]) => boolean;
  timeoutMs: number;
};

const collectSseEvents = async (response: Response, options: CollectOptions) => {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Expected response body to be a readable stream.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  const events: BaseEvent[] = [];

  const readLoop = async () => {
    const expectedTypes = options.expectedTypes ? new Set(options.expectedTypes) : undefined;
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        const lines = chunk.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const raw = trimmed.replace(/^data:\s*/, '');
            if (raw.length === 0) {
              continue;
            }
            const event = JSON.parse(raw) as BaseEvent;
            events.push(event);
            if (expectedTypes) {
              expectedTypes.delete(event.type);
              if (expectedTypes.size === 0) {
                return events;
              }
            }
            if (options.stopWhen && options.stopWhen(events)) {
              return events;
            }
          }
        }
      }
    }
    return events;
  };

  return withTimeout(readLoop(), options.timeoutMs, 'SSE event collection');
};

const runSyncCycle = async (
  client: Client,
  threadId: string,
  assistantId: string,
  telemetry: Array<{
    cycle: number;
    poolAddress: `0x${string}`;
    midPrice: number;
    action: string;
    reason: string;
    timestamp: string;
  }>,
) => {
  const runMessage: Message = {
    type: 'human',
    content: JSON.stringify({ command: 'sync' }),
    id: uuidv7(),
  };

  await client.threads.updateState(threadId, {
    values: {
      messages: [runMessage],
      private: {
        bootstrapped: true,
        pollIntervalMs: 60_000,
        streamLimit: 100,
        cronScheduled: false,
      },
      view: { command: 'sync', activity: { telemetry, events: [] } },
    },
    asNode: 'runCommand',
  });

  const run = await client.runs.create(threadId, assistantId, {
    input: null,
    streamMode: ['events', 'values', 'updates'],
    streamResumable: true,
  });
  await client.runs.join(threadId, run.run_id);
};

describe('CopilotKit connect happy path', () => {
  it('returns snapshots from the Next BFF connect endpoint for an existing thread', async () => {
    // Given a running LangGraph deployment with the CLMM graph loaded
    const deploymentUrl = requireEnv('LANGGRAPH_DEPLOYMENT_URL');
    process.env['LANGGRAPH_DEPLOYMENT_URL'] = deploymentUrl;

    const client = new Client({
      apiUrl: deploymentUrl,
      apiKey: process.env['LANGGRAPH_API_KEY'],
    });

    const assistants = await client.assistants.search({ graphId: GRAPH_ID, limit: 1 });
    const assistantId =
      assistants[0]?.assistant_id ??
      (
        await client.assistants.create({
          assistantId: GRAPH_ID,
          graphId: GRAPH_ID,
          name: GRAPH_ID,
          ifExists: 'do_nothing',
        })
      ).assistant_id;

    const threadId = uuidv7();
    await client.threads.create({ threadId, graphId: GRAPH_ID, ifExists: 'do_nothing' });

    const message: Message = {
      type: 'human',
      content: 'E2E snapshot check',
      id: uuidv7(),
    };

    await client.threads.updateState(threadId, {
      values: { messages: [message], view: { command: 'sync' } },
      asNode: 'runCommand',
    });

    // When we connect through the Next BFF endpoint
    const controller = new AbortController();
    const body = {
      method: 'agent/connect',
      params: { agentId: GRAPH_ID },
      body: {
        threadId,
        messages: [],
        state: {},
      },
    };

    const req = new NextRequest('http://localhost/api/copilotkit', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
    });

    const { POST } = await import('../src/app/api/copilotkit/route.js');
    const response = await POST(req);

    expect(response.status).toBe(200);

    const events = await collectSseEvents(response, {
      expectedTypes: new Set([EventType.MESSAGES_SNAPSHOT, EventType.STATE_SNAPSHOT]),
      timeoutMs: 10000,
    });

    controller.abort();

    // Then we receive message + state snapshots for the thread
    const messagesSnapshot = events.find((event) => event.type === EventType.MESSAGES_SNAPSHOT);
    const stateSnapshot = events.find((event) => event.type === EventType.STATE_SNAPSHOT);

    expect(messagesSnapshot).toBeDefined();
    expect(stateSnapshot).toBeDefined();
    const snapshotMessages = (messagesSnapshot as { messages?: Array<{ content?: string }> }).messages ?? [];
    expect(snapshotMessages.some((entry) => entry.content === 'E2E snapshot check')).toBe(true);
    expect((stateSnapshot as { snapshot?: unknown }).snapshot).toBeDefined();
    expect(assistantId).toBeTruthy();
  });

  it('streams multiple run cycles through a single connect stream', async () => {
    // Given a running LangGraph deployment with the CLMM graph loaded
    const deploymentUrl = requireEnv('LANGGRAPH_DEPLOYMENT_URL');
    process.env['LANGGRAPH_DEPLOYMENT_URL'] = deploymentUrl;

    const client = new Client({
      apiUrl: deploymentUrl,
      apiKey: process.env['LANGGRAPH_API_KEY'],
    });

    const assistants = await client.assistants.search({ graphId: GRAPH_ID, limit: 1 });
    const assistantId =
      assistants[0]?.assistant_id ??
      (
        await client.assistants.create({
          assistantId: GRAPH_ID,
          graphId: GRAPH_ID,
          name: GRAPH_ID,
          ifExists: 'do_nothing',
        })
      ).assistant_id;

    const threadId = uuidv7();
    await client.threads.create({ threadId, graphId: GRAPH_ID, ifExists: 'do_nothing' });

    // When we open a connect stream and trigger two sync cycles
    const controller = new AbortController();
    const body = {
      method: 'agent/connect',
      params: { agentId: GRAPH_ID },
      body: {
        threadId,
        messages: [],
        state: {},
      },
    };

    const req = new NextRequest('http://localhost/api/copilotkit', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
    });

    const { POST } = await import('../src/app/api/copilotkit/route.js');
    const response = await POST(req);

    expect(response.status).toBe(200);

    const telemetryBase = {
      poolAddress: '0x0000000000000000000000000000000000000001' as const,
      midPrice: 1,
      action: 'hold',
      reason: 'e2e',
    };
    const telemetryCycle1 = [
      {
        ...telemetryBase,
        cycle: 1,
        timestamp: new Date().toISOString(),
      },
    ];
    const telemetryCycle2 = [
      ...telemetryCycle1,
      {
        ...telemetryBase,
        cycle: 2,
        timestamp: new Date(Date.now() + 1000).toISOString(),
      },
    ];

    const eventsPromise = collectSseEvents(response, {
      timeoutMs: 30000,
      stopWhen: (events) => {
        const runFinished = events.filter((event) => event.type === EventType.RUN_FINISHED).length;
        const snapshotLengths = events
          .filter((event) => event.type === EventType.STATE_SNAPSHOT)
          .map((event) => {
            const rawEvent = (event as { rawEvent?: { values?: unknown } }).rawEvent;
            if (!rawEvent || typeof rawEvent !== 'object') {
              return undefined;
            }
            const values = (rawEvent as { values?: unknown }).values;
            if (!values || typeof values !== 'object') {
              return undefined;
            }
            const view = (values as { view?: unknown }).view;
            if (!view || typeof view !== 'object') {
              return undefined;
            }
            const activity = (view as { activity?: unknown }).activity;
            if (!activity || typeof activity !== 'object') {
              return undefined;
            }
            const telemetry = (activity as { telemetry?: unknown }).telemetry;
            if (!Array.isArray(telemetry)) {
              return undefined;
            }
            return telemetry.length;
          })
          .filter((length): length is number => typeof length === 'number');
        return (
          runFinished >= 2 && snapshotLengths.includes(1) && snapshotLengths.includes(2)
        );
      },
    });

    await runSyncCycle(client, threadId, assistantId, telemetryCycle1);
    await runSyncCycle(client, threadId, assistantId, telemetryCycle2);

    const events = await eventsPromise;
    controller.abort();

    // Then we receive run boundaries for both cycles
    const runStarted = events.filter((event) => event.type === EventType.RUN_STARTED);
    const runFinished = events.filter((event) => event.type === EventType.RUN_FINISHED);

    expect(runStarted.length).toBeGreaterThanOrEqual(2);
    expect(runFinished.length).toBeGreaterThanOrEqual(2);

    const snapshotLengths = events
      .filter((event) => event.type === EventType.STATE_SNAPSHOT)
      .map((event) => {
        const rawEvent = (event as { rawEvent?: { values?: unknown } }).rawEvent;
        if (!rawEvent || typeof rawEvent !== 'object') {
          return undefined;
        }
        const values = (rawEvent as { values?: unknown }).values;
        if (!values || typeof values !== 'object') {
          return undefined;
        }
        const view = (values as { view?: unknown }).view;
        if (!view || typeof view !== 'object') {
          return undefined;
        }
        const activity = (view as { activity?: unknown }).activity;
        if (!activity || typeof activity !== 'object') {
          return undefined;
        }
        const telemetry = (activity as { telemetry?: unknown }).telemetry;
        if (!Array.isArray(telemetry)) {
          return undefined;
        }
        return telemetry.length;
      })
      .filter((length): length is number => typeof length === 'number');

    expect(snapshotLengths).toContain(1);
    expect(snapshotLengths).toContain(2);
  });
});
