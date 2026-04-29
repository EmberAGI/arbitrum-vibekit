import { randomUUID } from 'node:crypto';

import { defaultApplyEvents, verifyEvents } from '@ag-ui/client';
import { EventType, type BaseEvent, type Message } from '@ag-ui/core';
import { filter, firstValueFrom, from, lastValueFrom, map, take, toArray, type Observable } from 'rxjs';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { createAgentRuntimeHttpAgent } from '../copilotkit/piRuntimeHttpAgent';
import {
  EMBER_LENDING_AGENT_NAME,
  PORTFOLIO_MANAGER_AGENT_NAME,
  resolveAgentRuntimeUrl,
} from '../copilotkit/copilotRuntimeRegistry';

export const runtime = 'nodejs';

const agentCommandPayloadBaseSchema = z.object({
  agentId: z.enum([PORTFOLIO_MANAGER_AGENT_NAME, EMBER_LENDING_AGENT_NAME]),
  threadId: z.string().min(1),
});

const agentNamedCommandPayloadSchema = agentCommandPayloadBaseSchema.extend({
  command: z.object({
    name: z.string().min(1),
    input: z.unknown().optional(),
  }),
});

const agentResumePayloadSchema = agentCommandPayloadBaseSchema.extend({
  resume: z.unknown(),
});

const agentMessagePayloadSchema = agentCommandPayloadBaseSchema.extend({
  message: z.object({
    id: z.string().min(1),
    content: z.string().min(1),
  }),
});

const agentCommandPayloadSchema = z.union([
  agentNamedCommandPayloadSchema,
  agentResumePayloadSchema,
  agentMessagePayloadSchema,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readTaskStatusMessage(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  return readString(value['content']);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectErrorText(error: unknown, depth = 0): string {
  if (depth > 4 || error === null || error === undefined) {
    return '';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return [
      error.name,
      error.message,
      collectErrorText((error as Error & { cause?: unknown }).cause, depth + 1),
    ].join(' ');
  }

  if (!isRecord(error)) {
    return String(error);
  }

  return [
    readString(error['name']),
    readString(error['message']),
    readString(error['error']),
    readString(error['code']),
    collectErrorText(error['cause'], depth + 1),
    collectErrorText(error['payload'], depth + 1),
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
}

function isTransientAgentRunError(error: unknown): boolean {
  const text = collectErrorText(error).toLowerCase();
  return (
    text.includes('agent is already processing') ||
    text.includes('already processing') ||
    text.includes('terminated') ||
    text.includes('und_err_socket') ||
    text.includes('socketerror') ||
    text.includes('bodytimeout') ||
    text.includes('body timeout')
  );
}

async function runWithTransientRetry<T>(params: {
  enabled: boolean;
  action: () => Promise<T>;
}): Promise<T> {
  const maxAttempts = params.enabled ? 12 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await params.action();
    } catch (error) {
      lastError = error;
      if (!params.enabled || attempt === maxAttempts - 1 || !isTransientAgentRunError(error)) {
        throw error;
      }

      await sleep(Math.min(1_500 + attempt * 750, 5_000));
    }
  }

  throw lastError;
}

async function collectAgentRunEvents(params: {
  events: Observable<BaseEvent>;
  tolerateTransientErrorWithEvents: boolean;
}): Promise<BaseEvent[]> {
  return new Promise((resolve, reject) => {
    const events: BaseEvent[] = [];

    params.events.subscribe({
      next: (event) => {
        events.push(event);
      },
      error: (error) => {
        if (
          params.tolerateTransientErrorWithEvents &&
          isTransientAgentRunError(error)
        ) {
          resolve(events);
          return;
        }

        reject(error);
      },
      complete: () => {
        resolve(events);
      },
    });
  });
}

function readThrownErrorStatus(error: unknown): number {
  if (!isRecord(error)) {
    return 500;
  }

  const status = error['status'];
  return typeof status === 'number' && status >= 400 && status <= 599 ? status : 500;
}

function readThrownErrorMessage(error: unknown): string {
  if (!isRecord(error)) {
    return 'Agent command failed.';
  }

  const payload = isRecord(error['payload']) ? error['payload'] : null;
  const payloadMessage = readString(payload?.['message']) ?? readString(payload?.['error']);
  if (payloadMessage) {
    return payloadMessage;
  }

  const message = readString(error['message']);
  if (message && !/^HTTP \d{3}$/.test(message)) {
    return message;
  }

  return 'Agent command failed.';
}

function serializeResumePayloadForRuntime(resume: unknown): string {
  if (typeof resume === 'string') {
    return resume;
  }

  return JSON.stringify(resume) ?? 'null';
}

async function readAuthoritativeStateDocument(params: {
  threadId: string;
  events: readonly BaseEvent[];
}): Promise<{
  state: Record<string, unknown> | null;
  messages: Message[] | null;
  sawDelta: boolean;
  sawSnapshot: boolean;
}> {
  const sawDelta = params.events.some((event) => event.type === EventType.STATE_DELTA);
  const sawSnapshot = params.events.some((event) => event.type === EventType.STATE_SNAPSHOT);
  const sawMessages = params.events.some(
    (event) =>
      event.type === EventType.MESSAGES_SNAPSHOT ||
      event.type === EventType.TEXT_MESSAGE_START ||
      event.type === EventType.TEXT_MESSAGE_CONTENT ||
      event.type === EventType.TEXT_MESSAGE_END ||
      event.type === EventType.TOOL_CALL_START ||
      event.type === EventType.TOOL_CALL_ARGS ||
      event.type === EventType.TOOL_CALL_END,
  );
  if (!sawSnapshot && !sawMessages) {
    return {
      state: null,
      messages: null,
      sawDelta,
      sawSnapshot,
    };
  }

  const mutations = await lastValueFrom(
    defaultApplyEvents(
      {
        threadId: params.threadId,
        runId: 'route-state-reconcile',
        messages: [],
        state: {},
        tools: [],
        context: [],
        forwardedProps: {},
      },
      from(params.events),
      {} as never,
      [],
    ).pipe(toArray()),
  );
  const state = mutations.reduce<Record<string, unknown> | null>(
    (latestState, mutation) => (isRecord(mutation.state) ? mutation.state : latestState),
    null,
  );
  const messages = mutations.reduce<Message[] | null>(
    (latestMessages, mutation) =>
      Array.isArray(mutation.messages) ? (mutation.messages as Message[]) : latestMessages,
    null,
  );

  return {
    state,
    messages,
    sawDelta,
    sawSnapshot,
  };
}

async function readFirstConnectSnapshot(params: {
  agent: ReturnType<typeof createAgentRuntimeHttpAgent>;
  threadId: string;
}): Promise<Record<string, unknown> | null> {
  try {
    const snapshot = await firstValueFrom(
      params.agent
        .connect({
          threadId: params.threadId,
          runId: randomUUID(),
          messages: [],
          state: {},
          tools: [],
          context: [],
        })
        .pipe(
        verifyEvents(false),
        filter(
          (
            event,
          ): event is BaseEvent & {
            type: typeof EventType.STATE_SNAPSHOT;
            snapshot: unknown;
          } => event.type === EventType.STATE_SNAPSHOT && isRecord((event as { snapshot?: unknown }).snapshot),
        ),
        map((event) => event.snapshot as Record<string, unknown>),
          take(1),
        ),
    );

    return snapshot;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json(
      {
        ok: false,
        error: 'Invalid agent command payload.',
      },
      { status: 400 },
    );
  }

  const parsedPayload = agentCommandPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return Response.json(
      {
        ok: false,
        error: 'Invalid agent command payload.',
      },
      { status: 400 },
    );
  }

  const { agentId, threadId } = parsedPayload.data;

  try {
    const runtimeUrl = resolveAgentRuntimeUrl(process.env, agentId);
    let lastAgent = createAgentRuntimeHttpAgent({
      agentId,
      runtimeUrl,
    });
    const forwardedCommand =
      'command' in parsedPayload.data
        ? {
            name: parsedPayload.data.command.name,
            ...(Object.prototype.hasOwnProperty.call(parsedPayload.data.command, 'input')
              ? { input: parsedPayload.data.command.input }
              : {}),
          }
        : 'resume' in parsedPayload.data
          ? {
            resume: serializeResumePayloadForRuntime(parsedPayload.data.resume),
            }
          : null;
    const messages =
      'message' in parsedPayload.data
        ? [
            {
              id: parsedPayload.data.message.id,
              role: 'user' as const,
              content: parsedPayload.data.message.content,
            },
          ]
        : [];
    const isChatMessageCommand = 'message' in parsedPayload.data;
    const runEvents = await runWithTransientRetry({
      enabled: false,
      action: () => {
        lastAgent = createAgentRuntimeHttpAgent({
          agentId,
          runtimeUrl,
        });

        return collectAgentRunEvents({
          tolerateTransientErrorWithEvents: isChatMessageCommand,
          events: lastAgent
            .run({
              threadId,
              runId: randomUUID(),
              messages,
              state: {},
              tools: [],
              context: [],
              ...(forwardedCommand
                ? {
                    forwardedProps: {
                      command: forwardedCommand,
                    },
                  }
                : {}),
            })
            .pipe(verifyEvents(false)),
        });
      },
    });

    const runState = await readAuthoritativeStateDocument({
      threadId,
      events: runEvents,
    });
    let snapshot = runState.state;
    let responseMessages = runState.messages;

    if (!snapshot && runState.sawDelta && !runState.sawSnapshot) {
      snapshot = await readFirstConnectSnapshot({
        agent: lastAgent,
        threadId,
      });
    }
    if (!snapshot && isChatMessageCommand) {
      await sleep(30_000);
      snapshot = await readFirstConnectSnapshot({
        agent: lastAgent,
        threadId,
      });
    }
    if (!responseMessages && Array.isArray(snapshot?.['messages'])) {
      responseMessages = snapshot['messages'] as Message[];
    }

    const thread = isRecord(snapshot?.['thread']) ? snapshot['thread'] : null;
    const projected = isRecord(snapshot?.['projected']) ? snapshot['projected'] : null;
    const task = isRecord(thread?.['task']) ? thread['task'] : null;
    const taskStatus = isRecord(task?.['taskStatus']) ? task['taskStatus'] : null;
    const execution = isRecord(thread?.['execution']) ? thread['execution'] : null;
    const taskState = readString(taskStatus?.['state']);
    const statusMessage = readTaskStatusMessage(taskStatus?.['message']);
    const executionStatus = readString(execution?.['status']);
    const executionStatusMessage = readString(execution?.['statusMessage']);
    const executionError = readString(thread?.['executionError']);
    const haltReason = readString(thread?.['haltReason']);

    if (
      taskState === 'failed' ||
      taskState === 'canceled' ||
      executionStatus === 'failed' ||
      executionStatus === 'canceled' ||
      executionError ||
      haltReason
    ) {
      return Response.json(
        {
          ok: false,
          error:
            executionError ??
            haltReason ??
            executionStatusMessage ??
            statusMessage ??
            ('command' in parsedPayload.data
              ? `Agent command '${parsedPayload.data.command.name}' failed.`
              : 'Agent resume failed.'),
        },
        { status: 409 },
      );
    }

    return Response.json({
      ok: true,
      taskState,
      statusMessage,
      domainProjection: projected,
      messages: responseMessages,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: readThrownErrorMessage(error),
      },
      { status: readThrownErrorStatus(error) },
    );
  }
}
