import { pathToFileURL } from 'node:url';

import cron from 'node-cron';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

type MessageInput = {
  id: string;
  role: 'user';
  content: string;
};

type RunCreatePayload = {
  assistant_id: string;
  input?: {
    messages: MessageInput[];
  };
  config?: {
    configurable?: {
      thread_id?: string;
    };
  };
  metadata?: Record<string, unknown>;
  stream_mode?: Array<
    | 'values'
    | 'messages'
    | 'messages-tuple'
    | 'updates'
    | 'events'
    | 'tasks'
    | 'checkpoints'
    | 'debug'
    | 'custom'
  >;
  stream_resumable?: boolean;
};

type ThreadCreatePayload = {
  thread_id: string;
  if_exists: 'do_nothing' | 'raise';
};

const RunResponseSchema = z
  .object({
    run_id: z.string(),
    status: z.string().optional(),
  })
  .catchall(z.unknown());

const ThreadResponseSchema = z
  .object({
    thread_id: z.string(),
  })
  .catchall(z.unknown());

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_STREAM_STEPS = 6;
const DEFAULT_STREAM_DELAY_MS = 600;

const parseNumber = (value?: string): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toCronExpression = (intervalMs: number): string => {
  const intervalSeconds = Math.max(1, Math.round(intervalMs / 1000));
  if (intervalSeconds < 60) {
    return `*/${intervalSeconds} * * * * *`;
  }

  if (intervalSeconds % 60 === 0) {
    const minutes = Math.max(1, Math.floor(intervalSeconds / 60));
    return `0 */${minutes} * * * *`;
  }

  const clampedSeconds = Math.min(59, intervalSeconds);
  console.warn(
    `[starter-cron] Requested interval ${intervalMs}ms is not a clean minute multiple; clamping to ${clampedSeconds}s cron schedule.`,
  );
  return `*/${clampedSeconds} * * * * *`;
};

const resolveBaseUrl = () => {
  const raw = process.env.LANGGRAPH_DEPLOYMENT_URL ?? 'http://localhost:8123';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};

const resolveThreadId = () => process.env.STARTER_THREAD_ID ?? uuidv7();

const resolveIntervalMs = () =>
  parseNumber(process.env.STARTER_CRON_INTERVAL_MS) ?? DEFAULT_INTERVAL_MS;

const resolveStreamSteps = () =>
  parseNumber(process.env.STARTER_CRON_STEPS) ?? DEFAULT_STREAM_STEPS;

const resolveStreamDelayMs = () =>
  parseNumber(process.env.STARTER_CRON_DELAY_MS) ?? DEFAULT_STREAM_DELAY_MS;

const buildStreamMessage = (steps: number, delayMs: number): MessageInput => ({
  id: uuidv7(),
  role: 'user',
  content: JSON.stringify({ command: 'stream', steps, delayMs }),
});

const buildRunPayload = (params: {
  graphId: string;
  threadId: string;
  steps: number;
  delayMs: number;
}): RunCreatePayload => ({
  assistant_id: params.graphId,
  input: {
    messages: [buildStreamMessage(params.steps, params.delayMs)],
  },
  config: {
    configurable: {
      thread_id: params.threadId,
    },
  },
  metadata: {
    source: 'starter-cron',
  },
  stream_mode: ['events', 'values', 'messages'],
  stream_resumable: true,
});

const buildThreadPayload = (threadId: string): ThreadCreatePayload => ({
  thread_id: threadId,
  if_exists: 'do_nothing',
});

const parseJsonResponse = async <T>(response: Response, schema: z.ZodSchema<T>): Promise<T> => {
  const payloadText = await response.text();
  if (!response.ok) {
    throw new Error(`LangGraph API request failed (${response.status}): ${payloadText}`);
  }
  const payload = payloadText ? (JSON.parse(payloadText) as unknown) : ({} as unknown);
  return schema.parse(payload);
};

const ensureThread = async (baseUrl: string, threadId: string) => {
  const response = await fetch(`${baseUrl}/threads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildThreadPayload(threadId)),
  });
  await parseJsonResponse(response, ThreadResponseSchema);
};

const createRun = async (params: {
  baseUrl: string;
  threadId: string;
  graphId: string;
  steps: number;
  delayMs: number;
}) => {
  const response = await fetch(`${params.baseUrl}/threads/${params.threadId}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      buildRunPayload({
        graphId: params.graphId,
        threadId: params.threadId,
        steps: params.steps,
        delayMs: params.delayMs,
      }),
    ),
  });

  if (response.status === 422) {
    const payloadText = await response.text();
    console.info(`[starter-cron] Run rejected: ${payloadText}`);
    return undefined;
  }

  const run = await parseJsonResponse(response, RunResponseSchema);
  return run.run_id;
};

const startStarterCron = async () => {
  const baseUrl = resolveBaseUrl();
  const graphId = process.env.LANGGRAPH_GRAPH_ID ?? 'starterAgent';
  const threadId = resolveThreadId();
  const intervalMs = resolveIntervalMs();
  const steps = resolveStreamSteps();
  const delayMs = resolveStreamDelayMs();
  const cronExpression =
    process.env.STARTER_CRON_EXPRESSION ?? toCronExpression(intervalMs);

  if (!process.env.STARTER_THREAD_ID) {
    console.info(`[starter-cron] STARTER_THREAD_ID not provided; using ${threadId}`);
  }

  await ensureThread(baseUrl, threadId);

  console.info('[starter-cron] Scheduling API-driven runs', {
    baseUrl,
    threadId,
    graphId,
    cron: cronExpression,
    intervalMs,
    steps,
    delayMs,
  });

  cron.schedule(cronExpression, () => {
    console.info('[starter-cron] Tick', { threadId, cron: cronExpression });
    void createRun({ baseUrl, threadId, graphId, steps, delayMs }).then((runId) => {
      if (runId) {
        console.info('[starter-cron] Run created', { threadId, runId });
      }
    });
  });
};

const invokedAsEntryPoint =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsEntryPoint) {
  await startStarterCron();
}

export { startStarterCron };
